import { calculateFinalScore } from "../lib/scoring/finalScore";
import { scoreForms } from "../lib/scoring/formScore";
import { scoreUrl } from "../lib/scoring/urlScore";

const MAX_FORMS = 10;
const MAX_IFRAMES = 8;
const LOGIN_TEXT_PATTERN = /\b(log\s*in|sign\s*in|password|passcode|otp|verify|account|username|email)\b/i;
const USER_FIELD_PATTERN = /\b(user(name)?|email|login|account|phone|mobile)\b/i;

export function scanPage(trigger = "document_idle") {
  const pageUrl = new URL(window.location.href);
  const redirectCount = getNavigationRedirectCount();
  const formScan = collectForms();
  const urlResult = scoreUrl(pageUrl.href, { redirectCount });
  const formResult = scoreForms({
    pageUrl: pageUrl.href,
    forms: formScan.forms,
    iframeDepth: window.top === window ? 0 : 1,
  });
  const finalResult = calculateFinalScore({ urlResult, formResult });
  const aggregate = formResult.aggregate;

  return {
    url: sanitizeUrl(pageUrl),
    origin: pageUrl.origin,
    hostname: pageUrl.hostname,
    timestamp: new Date().toISOString(),
    trigger,
    redirect: {
      count: redirectCount,
      chain: [],
    },
    signals: {
      https: pageUrl.protocol === "https:",
      hasPasswordField: aggregate.passwordFieldCount > 0,
      formCount: aggregate.formCount,
      loginFormCount: aggregate.loginFormCount,
      passwordFieldCount: aggregate.passwordFieldCount,
      formPostsCrossOrigin: aggregate.crossOriginPasswordFormCount > 0 || aggregate.crossOriginCredentialFormCount > 0,
      formPostsToHttp: aggregate.insecureSubmitCount > 0,
      hiddenPasswordField: aggregate.hiddenPasswordFieldCount > 0,
      autocompleteDisabled: aggregate.autocompleteDisabledCount > 0,
      iframeLogin: aggregate.iframeLoginCount > 0,
      blockedIframeCount: formScan.blockedIframeCount,
      redirectCount,
      pathLength: pageUrl.pathname.length,
      queryPresent: pageUrl.search.length > 0,
      hashPresent: pageUrl.hash.length > 0,
      titleLength: document.title?.length ?? 0,
      excessiveSubdomains: urlResult.features.excessiveSubdomains,
      domainLooksRandom: urlResult.features.domainLooksRandom,
      brandDomainMismatch: urlResult.features.brandDomainMismatch,
      iframeDepth: window.top === window ? 0 : 1,
    },
    features: {
      url: urlResult.features,
      forms: aggregate,
    },
    forms: formScan.forms.slice(0, MAX_FORMS),
    scores: finalResult.scores,
    verdict: finalResult.verdict,
    severity: finalResult.severity,
    reasons: finalResult.reasons,
  };
}

function collectForms() {
  const topLevelForms = collectFormsFromDocument(document, { insideIframe: false, iframeDepth: 0 });
  const iframeScan = collectAccessibleIframeForms();

  return {
    forms: [...topLevelForms, ...iframeScan.forms].slice(0, MAX_FORMS),
    blockedIframeCount: iframeScan.blockedIframeCount,
  };
}

function collectFormsFromDocument(ownerDocument, context) {
  return Array.from(ownerDocument.forms).map((form, index) => collectFormEvidence(form, index, context));
}

function collectAccessibleIframeForms() {
  const iframes = Array.from(document.querySelectorAll("iframe")).slice(0, MAX_IFRAMES);
  const forms = [];
  let blockedIframeCount = 0;

  for (const iframe of iframes) {
    try {
      const iframeDocument = iframe.contentDocument;
      if (!iframeDocument) {
        blockedIframeCount += 1;
        continue;
      }

      forms.push(
        ...collectFormsFromDocument(iframeDocument, {
          insideIframe: true,
          iframeDepth: 1,
        }),
      );
    } catch {
      blockedIframeCount += 1;
    }
  }

  return { forms, blockedIframeCount };
}

function collectFormEvidence(form, index, context) {
  const ownerDocument = form.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const pageUrl = new URL(ownerWindow.location.href);
  const actionResult = getActionUrl(form, pageUrl.href);
  const elements = Array.from(form.elements ?? []);
  const inputs = elements.filter(isInputLikeElement);
  const passwordFields = inputs.filter((input) => getInputType(input) === "password");
  const hiddenInputs = inputs.filter((input) => getInputType(input) === "hidden" || isElementVisuallyHidden(input, ownerWindow));
  const hiddenPasswordFields = passwordFields.filter((input) => isElementVisuallyHidden(input, ownerWindow));
  const emailFields = inputs.filter(isEmailLikeField);
  const userLikeFields = inputs.filter(isUserLikeField);
  const autocompleteDisabled =
    form.autocomplete === "off" || inputs.some((input) => (input.getAttribute("autocomplete") ?? "").toLowerCase() === "off");

  return {
    id: `form-${context.iframeDepth}-${index}`,
    method: (form.getAttribute("method") || "get").toLowerCase(),
    pageProtocol: pageUrl.protocol,
    actionProtocol: actionResult.url.protocol,
    actionHost: actionResult.url.hostname,
    actionOrigin: actionResult.url.origin,
    actionIsCrossOrigin: actionResult.url.origin !== pageUrl.origin,
    hasExplicitAction: actionResult.hasExplicitAction,
    invalidAction: actionResult.invalid,
    inputCount: inputs.length,
    passwordFieldCount: passwordFields.length,
    hiddenInputCount: hiddenInputs.length,
    hiddenPasswordFieldCount: hiddenPasswordFields.length,
    emailFieldCount: emailFields.length,
    userLikeFieldCount: userLikeFields.length,
    autocompleteDisabled,
    hasLoginText: hasLoginText(form),
    insideIframe: context.insideIframe,
    iframeDepth: context.iframeDepth,
  };
}

function getActionUrl(form, pageHref) {
  const rawAction = form.getAttribute("action");
  const hasExplicitAction = Boolean(rawAction?.trim());

  try {
    return {
      url: new URL(hasExplicitAction ? rawAction : pageHref, pageHref),
      hasExplicitAction,
      invalid: false,
    };
  } catch {
    return {
      url: new URL(pageHref),
      hasExplicitAction,
      invalid: true,
    };
  }
}

function isInputLikeElement(element) {
  return ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

function getInputType(input) {
  return (input.getAttribute("type") || "text").toLowerCase();
}

function isEmailLikeField(input) {
  const type = getInputType(input);
  if (type === "email") return true;

  return USER_FIELD_PATTERN.test(getFieldMetadata(input)) && /\b(email|mail)\b/i.test(getFieldMetadata(input));
}

function isUserLikeField(input) {
  const type = getInputType(input);
  if (["email", "tel"].includes(type)) return true;
  return USER_FIELD_PATTERN.test(getFieldMetadata(input));
}

function getFieldMetadata(input) {
  return [
    input.getAttribute("autocomplete"),
    input.getAttribute("aria-label"),
    input.getAttribute("id"),
    input.getAttribute("name"),
    input.getAttribute("placeholder"),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasLoginText(form) {
  const text = [
    form.textContent,
    ...Array.from(form.querySelectorAll("input, button, label")).map(getFieldMetadata),
  ]
    .filter(Boolean)
    .join(" ");

  return LOGIN_TEXT_PATTERN.test(text);
}

function isElementVisuallyHidden(element, ownerWindow) {
  if (element.hidden || element.type === "hidden") return true;

  const style = ownerWindow.getComputedStyle(element);
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity) === 0 ||
    element.getBoundingClientRect().width === 0 ||
    element.getBoundingClientRect().height === 0
  );
}

function getNavigationRedirectCount() {
  const navigationEntry = performance.getEntriesByType("navigation")?.[0];
  return Number.isFinite(navigationEntry?.redirectCount) ? navigationEntry.redirectCount : 0;
}

function sanitizeUrl(url) {
  const clone = new URL(url.toString());
  clone.search = "";
  clone.hash = "";
  return clone.toString();
}
