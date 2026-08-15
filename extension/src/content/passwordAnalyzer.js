import { estimatePasswordStrength, sha256Hex } from "../lib/securityUtils";

const MESSAGE_TYPES = {
  PASSWORD_ANALYSIS_COLLECTED: "secureBrowser.passwordAnalysisCollected",
};

const PASSWORD_INPUT_SELECTOR = "input[type='password']";
const ANALYSIS_DEBOUNCE_MS = 700;
const inputTimers = new WeakMap();

function scheduleAnalysis(input) {
  if (!input) return;
  window.clearTimeout(inputTimers.get(input));
  const timer = window.setTimeout(() => {
    inputTimers.delete(input);
    analyzePasswordInput(input);
  }, ANALYSIS_DEBOUNCE_MS);
  inputTimers.set(input, timer);
}

async function sha1Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("").toUpperCase();
}

async function checkHibpKAnonymity(sha1HexFull) {
  // sha1HexFull should be uppercase hex string
  try {
    const prefix = sha1HexFull.slice(0, 5);
    const suffix = sha1HexFull.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return 0;
    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const [suff, count] = line.trim().split(":");
      if (!suff) continue;
      if (suff.toUpperCase() === suffix) {
        return Number(count) || 0;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

async function analyzePasswordInput(input) {
  const value = input.value || "";
  if (value.length < 4) return;

  const strength = estimatePasswordStrength(value);
  const sha256 = await sha256Hex(`secure-browser-password|${value}`);
  const sha1 = await sha1Hex(value);

  const pageUrl = window.location.href;
  const domain = (() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return "";
    }
  })();

  // Optional HIBP check only if user enabled it in storage
  let hibpPwnedCount = 0;
  try {
    const items = await new Promise((resolve) => chrome.storage.local.get({ secureBrowser: {} }, resolve));
    const hibpEnabled = items?.secureBrowser?.hibpEnabled ?? false;
    if (hibpEnabled) {
      hibpPwnedCount = await checkHibpKAnonymity(sha1);
    }
  } catch {
    hibpPwnedCount = 0;
  }

  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.PASSWORD_ANALYSIS_COLLECTED,
      payload: {
        pageUrl,
        domain,
        strength,
        hash: sha256,
        hibpPwnedCount,
      },
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function attachPasswordListeners(ownerDocument) {
  const inputs = Array.from(ownerDocument.querySelectorAll(PASSWORD_INPUT_SELECTOR));
  for (const input of inputs) {
    if (input._secureBrowserPasswordAttached) continue;
    input.addEventListener("input", () => scheduleAnalysis(input), { passive: true });
    input.addEventListener("blur", () => analyzePasswordInput(input));
    input._secureBrowserPasswordAttached = true;
  }
}

function observePasswordFields(ownerDocument) {
  if (!ownerDocument?.documentElement) return;

  attachPasswordListeners(ownerDocument);

  const observer = new ownerDocument.defaultView.MutationObserver((mutations) => {
    if (mutations.some((mutation) => Array.from(mutation.addedNodes).some(isPasswordNode))) {
      attachPasswordListeners(ownerDocument);
    }
  });

  observer.observe(ownerDocument.documentElement, {
    subtree: true,
    childList: true,
  });
}

function isPasswordNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return node.matches?.(PASSWORD_INPUT_SELECTOR) || Boolean(node.querySelector?.(PASSWORD_INPUT_SELECTOR));
}

export function initPasswordAnalyzer() {
  observePasswordFields(document);
  const iframes = Array.from(document.querySelectorAll("iframe"));
  for (const iframe of iframes) {
    try {
      if (iframe.contentDocument) {
        observePasswordFields(iframe.contentDocument);
      }
    } catch {
      // ignore cross-origin iframe content
    }
  }
}
