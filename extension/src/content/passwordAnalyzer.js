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

async function analyzePasswordInput(input) {
  const value = input.value || "";
  if (value.length < 4) {
    return;
  }

  const strength = estimatePasswordStrength(value);
  const hash = await sha256Hex(`secure-browser-password|${value}`);
  const pageUrl = window.location.href;
  const domain = (() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return "";
    }
  })();

  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.PASSWORD_ANALYSIS_COLLECTED,
      payload: {
        pageUrl,
        domain,
        strength,
        hash,
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

function estimatePasswordStrength(password) {
  if (typeof password !== "string" || password.length === 0) {
    return 0;
  }

  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].reduce(
    (count, pattern) => count + (pattern.test(password) ? 1 : 0),
    0,
  );
  const lengthScore = Math.min(password.length / 16, 1);
  const varietyScore = Math.max(0, categories - 1) * 0.16;
  return Math.max(0, Math.min(1, lengthScore + varietyScore));
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
