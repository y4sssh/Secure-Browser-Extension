import { calculateFinalScore } from "../lib/scoring/finalScore";
import { collectKnownBrands, isAllowedBrandHost } from "../lib/brand/brandProfiles.js";
import { scoreBrandGuard } from "../lib/scoring/brandGuardScore.js";
import { scoreForms } from "../lib/scoring/formScore";
import { getRegistrableDomain, scoreUrl } from "../lib/scoring/urlScore";

const MAX_FORMS = 15;
const MAX_IFRAMES = 8;
const MAX_TIMELINE_EVENTS = 12;
const MAX_TEXT_SNIPPETS = 16;
const MAX_TEXT_SNIPPET_LENGTH = 120;
const MAX_TEXT_FRAGMENT_LENGTH = 240;
const LOGIN_TEXT_PATTERN =
  /\b(log\s*in|sign\s*in|signin|password|passcode|otp|verify|verification|account|username|email|credential|sso|authenticate)\b/i;
const USER_FIELD_PATTERN = /\b(user(name)?|email|login|account|phone|mobile|identifier)\b/i;
const SECURITY_ACTION_PATTERN = /\b(login|signin|sign-in|auth|authenticate|session|sso|oauth|account|verify|password|credential)\b/i;

const formGuardState = {
  startedAt: Date.now(),
  pageUrl: "",
  previousSnapshot: null,
  timeline: [],
};

export function scanPage(trigger = "document_idle") {
  const pageUrl = new URL(window.location.href);
  const safePageUrl = sanitizeUrl(pageUrl);

  resetFormGuardForNavigation(safePageUrl);

  const redirectCount = getNavigationRedirectCount();
  const pageContext = collectPageContext(document);
  const formScan = collectForms(pageContext);
  const formGuardSnapshot = createFormGuardSnapshot(formScan.forms, formScan, pageContext);
  const timeline = updateFormGuardTimeline(trigger, formGuardSnapshot);
  const urlResult = scoreUrl(pageUrl.href, { redirectCount });
  const formResult = scoreForms({
    pageUrl: pageUrl.href,
    forms: formScan.forms,
    iframeDepth: window.top === window ? 0 : 1,
    blockedIframeCount: formScan.blockedIframeCount,
    suspectedCredentialIframeCount: formScan.suspectedCredentialIframeCount,
    claimedBrands: pageContext.claimedBrands,
    timeline,
  });
  const brandResult = scoreBrandGuard({
    pageUrl: pageUrl.href,
    claimedBrands: pageContext.claimedBrands,
    forms: formScan.forms,
    textSignals: pageContext.textSignals,
    urlFeatures: urlResult.features,
  });
  const finalResult = calculateFinalScore({ urlResult, formResult, brandResult });
  const aggregate = formResult.aggregate;
  const brandFeatures = brandResult.features;

  return {
    url: safePageUrl,
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
      formPostsCrossDomain: aggregate.crossDomainPasswordFormCount > 0 || aggregate.crossDomainCredentialFormCount > 0,
      formPostsToHttp: aggregate.insecureSubmitCount > 0,
      insecurePasswordSubmit: aggregate.insecurePasswordSubmitCount > 0,
      hiddenPasswordField: aggregate.hiddenPasswordFieldCount > 0,
      hiddenCredentialField: aggregate.hiddenCredentialFieldCount > 0,
      autocompleteDisabled: aggregate.autocompleteDisabledCount > 0,
      antiAnalysis: aggregate.antiAnalysisSignalCount > 0,
      delayedPasswordField: aggregate.delayedPasswordFieldCount > 0,
      formActionChanged: aggregate.actionChangedCount > 0,
      iframeLogin: aggregate.iframeLoginCount > 0,
      blockedIframeCount: formScan.blockedIframeCount,
      suspectedCredentialIframeCount: formScan.suspectedCredentialIframeCount,
      loginOverlay: aggregate.loginOverlayCount > 0,
      claimedBrand: pageContext.claimedBrands[0] ?? "",
      claimedBrands: pageContext.claimedBrands,
      brandActualDomain: brandFeatures.actualDomain,
      brandExpectedDomains: brandFeatures.expectedDomains,
      brandFormDomainMismatch: aggregate.brandedCrossDomainCredentialFormCount > 0,
      redirectCount,
      pathLength: pageUrl.pathname.length,
      queryPresent: pageUrl.search.length > 0,
      hashPresent: pageUrl.hash.length > 0,
      titleLength: document.title?.length ?? 0,
      excessiveSubdomains: urlResult.features.excessiveSubdomains,
      domainLooksRandom: urlResult.features.domainLooksRandom,
      brandDomainMismatch:
        brandFeatures.domainMismatch ||
        urlResult.features.brandDomainMismatch ||
        aggregate.brandedCrossDomainCredentialFormCount > 0,
      textRisk: brandFeatures.textRisk,
      textSnippetCount: brandFeatures.textSnippetCount,
      iframeDepth: window.top === window ? 0 : 1,
    },
    features: {
      url: urlResult.features,
      forms: aggregate,
      brandGuard: brandFeatures,
      textSignals: pageContext.textSignals,
      formGuard: {
        pageHasLoginText: pageContext.hasLoginText,
        pageLoginTextSignalCount: pageContext.loginTextSignalCount,
        claimedBrands: pageContext.claimedBrands,
        timeline,
      },
    },
    formGuard: {
      pageHasLoginText: pageContext.hasLoginText,
      loginTextSignalCount: pageContext.loginTextSignalCount,
      claimedBrands: pageContext.claimedBrands,
      timeline,
    },
    brandGuard: brandFeatures,
    textSignals: pageContext.textSignals,
    timeline,
    forms: formScan.forms.slice(0, MAX_FORMS),
    scores: finalResult.scores,
    verdict: finalResult.verdict,
    severity: finalResult.severity,
    reasons: finalResult.reasons,
  };
}

function collectForms(pageContext) {
  const topLevelForms = collectFormsFromDocument(document, {
    insideIframe: false,
    iframeDepth: 0,
    topPageUrl: window.location.href,
    pageContext,
  });
  const iframeScan = collectAccessibleIframeForms(pageContext);

  return {
    forms: [...topLevelForms, ...iframeScan.forms].slice(0, MAX_FORMS),
    blockedIframeCount: iframeScan.blockedIframeCount,
    suspectedCredentialIframeCount: iframeScan.suspectedCredentialIframeCount,
  };
}

function collectFormsFromDocument(ownerDocument, context) {
  return Array.from(ownerDocument.forms)
    .slice(0, MAX_FORMS)
    .map((form, index) => collectFormEvidence(form, index, context));
}

function collectAccessibleIframeForms(pageContext) {
  const iframes = Array.from(document.querySelectorAll("iframe")).slice(0, MAX_IFRAMES);
  const forms = [];
  let blockedIframeCount = 0;
  let suspectedCredentialIframeCount = 0;

  for (const iframe of iframes) {
    if (isLoginLikeIframe(iframe)) {
      suspectedCredentialIframeCount += 1;
    }

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
          topPageUrl: window.location.href,
          pageContext,
        }),
      );
    } catch {
      blockedIframeCount += 1;
    }
  }

  return { forms, blockedIframeCount, suspectedCredentialIframeCount };
}

function collectFormEvidence(form, index, context) {
  const ownerDocument = form.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const pageUrl = new URL(ownerWindow.location.href);
  const topPageUrl = new URL(context.topPageUrl);
  const pageRegistrableDomain = getRegistrableDomain(pageUrl.hostname);
  const topPageRegistrableDomain = getRegistrableDomain(topPageUrl.hostname);
  const actionResult = getActionUrl(form, pageUrl.href);
  const actionUrl = actionResult.url;
  const actionRegistrableDomain = actionUrl.hostname ? getRegistrableDomain(actionUrl.hostname) : "";
  const elements = Array.from(form.elements ?? []);
  const inputs = elements.filter(isInputLikeElement);
  const passwordFields = inputs.filter((input) => getInputType(input) === "password");
  const hiddenInputs = inputs.filter((input) => getInputType(input) === "hidden" || isElementVisuallyHidden(input, ownerWindow));
  const hiddenPasswordFields = passwordFields.filter((input) => isElementVisuallyHidden(input, ownerWindow));
  const hiddenCredentialFields = hiddenInputs.filter((input) => isUserLikeField(input, ownerDocument));
  const emailFields = inputs.filter((input) => isEmailLikeField(input, ownerDocument));
  const userLikeFields = inputs.filter((input) => isUserLikeField(input, ownerDocument));
  const loginTextSignalCount = countLoginTextSignals(form, ownerDocument);
  const hasLoginTextValue = loginTextSignalCount > 0;
  const credentialLike = passwordFields.length > 0 || emailFields.length > 0 || userLikeFields.length > 0 || hasLoginTextValue;
  const submitButtonActions = collectSubmitButtonActions(form, pageUrl.href, pageRegistrableDomain);
  const claimedBrands = collectKnownBrands([
    context.pageContext?.brandHaystack ?? "",
    ...getFormTextCues(form, ownerDocument),
    ...inputs.map((input) => getFieldMetadata(input, ownerDocument)),
  ]);
  const actionHost = actionUrl.hostname.toLowerCase();
  const brandDomainMismatch =
    credentialLike && claimedBrands.some((brand) => !isAllowedBrandHost(brand, actionHost, actionRegistrableDomain));
  const invalidAction = actionResult.invalid || !["http:", "https:"].includes(actionUrl.protocol);
  const autocompleteDisabled =
    (form.getAttribute("autocomplete") ?? "").toLowerCase() === "off" ||
    inputs.some((input) => (input.getAttribute("autocomplete") ?? "").toLowerCase() === "off");
  const antiAnalysisSignalCount = countAntiAnalysisSignals(form, inputs);
  const loginOverlay = credentialLike && isOverlayForm(form, ownerWindow);

  return {
    id: `form-${context.iframeDepth}-${index}`,
    method: (form.getAttribute("method") || "get").toLowerCase(),
    pageProtocol: pageUrl.protocol,
    pageRegistrableDomain,
    topPageRegistrableDomain,
    actionProtocol: actionUrl.protocol,
    actionHost,
    actionOrigin: actionUrl.origin,
    actionRegistrableDomain,
    actionIsCrossOrigin: actionUrl.origin !== pageUrl.origin,
    actionIsCrossDomain: Boolean(actionRegistrableDomain && pageRegistrableDomain && actionRegistrableDomain !== pageRegistrableDomain),
    actionIsCrossTopLevelDomain: Boolean(
      context.insideIframe &&
        actionRegistrableDomain &&
        topPageRegistrableDomain &&
        actionRegistrableDomain !== topPageRegistrableDomain,
    ),
    hasExplicitAction: actionResult.hasExplicitAction,
    invalidAction,
    submitButtonActionCount: submitButtonActions.count,
    submitButtonCrossDomainActionCount: submitButtonActions.crossDomainCount,
    submitButtonInsecureActionCount: submitButtonActions.insecureCount,
    inputCount: inputs.length,
    visibleInputCount: inputs.filter((input) => !isElementVisuallyHidden(input, ownerWindow)).length,
    passwordFieldCount: passwordFields.length,
    readonlyPasswordFieldCount: passwordFields.filter((input) => input.readOnly || input.disabled).length,
    hiddenInputCount: hiddenInputs.length,
    hiddenPasswordFieldCount: hiddenPasswordFields.length,
    hiddenCredentialFieldCount: hiddenCredentialFields.length,
    emailFieldCount: emailFields.length,
    userLikeFieldCount: userLikeFields.length,
    autocompleteDisabled,
    antiAnalysisSignalCount,
    pasteBlocked: hasPasteBlock(form) || inputs.some(hasPasteBlock),
    labelHasLoginText: inputs.some((input) => LOGIN_TEXT_PATTERN.test(getFieldLabelText(input, ownerDocument))),
    loginTextSignalCount,
    hasLoginText: hasLoginTextValue,
    claimedBrands,
    brandDomainMismatch,
    loginOverlay,
    insideIframe: context.insideIframe,
    iframeDepth: context.iframeDepth,
  };
}

function collectPageContext(ownerDocument) {
  const textSignals = collectSafeTextSignals(ownerDocument);
  const fragments = textSignals.snippets.map((snippet) => snippet.text);
  const brandHaystack = fragments.join(" ");

  return {
    hasLoginText: fragments.some((fragment) => LOGIN_TEXT_PATTERN.test(fragment)),
    loginTextSignalCount: fragments.filter((fragment) => LOGIN_TEXT_PATTERN.test(fragment)).length,
    claimedBrands: collectKnownBrands(fragments),
    brandHaystack,
    textSignals,
  };
}

function collectSafeTextSignals(ownerDocument) {
  const candidates = [
    { source: "title", text: ownerDocument.title },
    ...collectElementTextCues(ownerDocument, "h1, h2, h3", "heading", 12),
    ...collectElementTextCues(ownerDocument, "button, input[type='button'], input[type='submit']", "button", 12),
    ...collectElementTextCues(ownerDocument, "label", "label", 16),
    ...collectElementTextCues(ownerDocument, "input, textarea, select", "field", 24),
    ...collectElementTextCues(ownerDocument, "img[alt], [aria-label]", "accessible-label", 16),
  ];
  const snippets = [];
  const redactions = {
    emails: 0,
    numbers: 0,
    tokens: 0,
    longStrings: 0,
  };

  for (const candidate of candidates) {
    const result = sanitizeTextSnippet(candidate.text);
    if (!result.text || snippets.some((snippet) => snippet.text === result.text)) {
      continue;
    }

    snippets.push({
      source: candidate.source,
      text: result.text,
    });
    redactions.emails += result.redactions.emails;
    redactions.numbers += result.redactions.numbers;
    redactions.tokens += result.redactions.tokens;
    redactions.longStrings += result.redactions.longStrings;

    if (snippets.length >= MAX_TEXT_SNIPPETS) {
      break;
    }
  }

  const textValues = snippets.map((snippet) => snippet.text);

  return {
    snippets,
    snippetCount: snippets.length,
    sources: snippets
      .map((snippet) => snippet.source)
      .filter((source, index, sources) => sources.indexOf(source) === index),
    redactions,
    redactionCount: redactions.emails + redactions.numbers + redactions.tokens + redactions.longStrings,
    hasLoginText: textValues.some((fragment) => LOGIN_TEXT_PATTERN.test(fragment)),
    loginTextSignalCount: textValues.filter((fragment) => LOGIN_TEXT_PATTERN.test(fragment)).length,
    claimedBrands: collectKnownBrands(textValues),
  };
}

function collectElementTextCues(ownerDocument, selector, source, limit) {
  return Array.from(ownerDocument.querySelectorAll(selector))
    .filter((element) => isElementProbablyVisible(element, ownerDocument.defaultView ?? window))
    .slice(0, limit)
    .map((element) => ({ source, text: getElementTextCue(element) }))
    .filter((item) => item.text);
}

function getElementTextCue(element) {
  if (!element) return "";

  return [
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("alt"),
    element.getAttribute?.("placeholder"),
    element.getAttribute?.("name"),
    element.getAttribute?.("id"),
    element.textContent,
  ]
    .filter(Boolean)
    .map(getLimitedText)
    .join(" ");
}

function sanitizeTextSnippet(value) {
  const redactions = {
    emails: 0,
    numbers: 0,
    tokens: 0,
    longStrings: 0,
  };
  let text = String(value ?? "").replace(/\s+/g, " ").trim();

  text = replaceAndCount(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]", (count) => {
    redactions.emails += count;
  });
  text = replaceAndCount(text, /\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b/g, "[token]", (count) => {
    redactions.tokens += count;
  });
  text = replaceAndCount(text, /\b\+?\d[\d\s().-]{3,}\d\b/g, "[number]", (count) => {
    redactions.numbers += count;
  });
  text = replaceAndCount(text, /\b[^\s]{40,}\b/g, "[long]", (count) => {
    redactions.longStrings += count;
  });

  return {
    text: text.slice(0, MAX_TEXT_SNIPPET_LENGTH),
    redactions,
  };
}

function replaceAndCount(value, pattern, replacement, onCount) {
  const matches = value.match(pattern) ?? [];
  if (matches.length > 0) {
    onCount(matches.length);
  }
  return value.replace(pattern, replacement);
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

function collectSubmitButtonActions(form, pageHref, pageRegistrableDomain) {
  const controls = Array.from(form.querySelectorAll("button[formaction], input[formaction]")).slice(0, 8);
  let crossDomainCount = 0;
  let insecureCount = 0;

  for (const control of controls) {
    try {
      const actionUrl = new URL(control.getAttribute("formaction"), pageHref);
      const actionDomain = actionUrl.hostname ? getRegistrableDomain(actionUrl.hostname) : "";
      if (actionDomain && pageRegistrableDomain && actionDomain !== pageRegistrableDomain) {
        crossDomainCount += 1;
      }
      if (actionUrl.protocol === "http:") {
        insecureCount += 1;
      }
    } catch {
      // Invalid per-button destinations are covered by the form action reason.
    }
  }

  return {
    count: controls.length,
    crossDomainCount,
    insecureCount,
  };
}

function isInputLikeElement(element) {
  return ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

function getInputType(input) {
  return (input.getAttribute("type") || "text").toLowerCase();
}

function isEmailLikeField(input, ownerDocument) {
  const type = getInputType(input);
  const metadata = getFieldMetadata(input, ownerDocument);
  if (type === "email") return true;

  return USER_FIELD_PATTERN.test(metadata) && /\b(email|mail)\b/i.test(metadata);
}

function isUserLikeField(input, ownerDocument) {
  const type = getInputType(input);
  if (["email", "tel"].includes(type)) return true;
  return USER_FIELD_PATTERN.test(getFieldMetadata(input, ownerDocument));
}

function getFieldMetadata(input, ownerDocument) {
  return [
    input.getAttribute("autocomplete"),
    input.getAttribute("aria-label"),
    input.getAttribute("id"),
    input.getAttribute("name"),
    input.getAttribute("placeholder"),
    getFieldLabelText(input, ownerDocument),
  ]
    .filter(Boolean)
    .map(getLimitedText)
    .join(" ");
}

function getFieldLabelText(input, ownerDocument) {
  const labels = [];

  if (input.labels?.length) {
    labels.push(...Array.from(input.labels).map((label) => label.textContent));
  }

  const id = input.getAttribute("id");
  if (id && typeof globalThis.CSS?.escape === "function") {
    labels.push(
      ...Array.from(ownerDocument.querySelectorAll(`label[for="${globalThis.CSS.escape(id)}"]`)).map((label) => label.textContent),
    );
  }

  const closestLabel = input.closest?.("label");
  if (closestLabel) {
    labels.push(closestLabel.textContent);
  }

  return labels.filter(Boolean).map(getLimitedText).join(" ");
}

function countLoginTextSignals(form, ownerDocument) {
  const fragments = getFormTextCues(form, ownerDocument);

  return fragments.filter((fragment) => LOGIN_TEXT_PATTERN.test(fragment)).length;
}

function getFormTextCues(form, ownerDocument) {
  return [
    form.getAttribute("aria-label"),
    form.getAttribute("name"),
    form.getAttribute("id"),
    ...Array.from(form.querySelectorAll("input, button, label, textarea, select")).map((element) =>
      element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT"
        ? getFieldMetadata(element, ownerDocument)
        : getElementTextCue(element),
    ),
  ]
    .filter(Boolean)
    .map(getLimitedText);
}

function countAntiAnalysisSignals(form, inputs) {
  const elements = [form, ...inputs];
  return elements.reduce((count, element) => count + countElementAntiAnalysisSignals(element), 0);
}

function countElementAntiAnalysisSignals(element) {
  const suspiciousAttributes = ["onpaste", "oncopy", "oncut", "oncontextmenu", "ondragstart", "autocomplete"];
  return suspiciousAttributes.reduce((count, attributeName) => {
    const value = (element.getAttribute(attributeName) ?? "").toLowerCase();
    if (!value) return count;
    if (attributeName === "autocomplete" && value !== "off") return count;
    return count + 1;
  }, 0);
}

function hasPasteBlock(element) {
  return Boolean((element.getAttribute?.("onpaste") ?? "").trim());
}

function isLoginLikeIframe(iframe) {
  const haystack = [
    iframe.getAttribute("src"),
    iframe.getAttribute("title"),
    iframe.getAttribute("name"),
    iframe.getAttribute("aria-label"),
    iframe.getAttribute("id"),
  ]
    .filter(Boolean)
    .join(" ");

  return LOGIN_TEXT_PATTERN.test(haystack) || SECURITY_ACTION_PATTERN.test(haystack);
}

function isOverlayForm(form, ownerWindow) {
  const viewportArea = Math.max(1, ownerWindow.innerWidth * ownerWindow.innerHeight);
  let element = form;
  let depth = 0;

  while (element && element.nodeType === Node.ELEMENT_NODE && depth < 6) {
    const style = ownerWindow.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const areaRatio = Math.max(0, rect.width * rect.height) / viewportArea;
    const zIndex = Number.parseInt(style.zIndex, 10);
    const fixedOrSticky = style.position === "fixed" || style.position === "sticky";

    if (fixedOrSticky && (Number.isFinite(zIndex) ? zIndex >= 10 : true) && areaRatio >= 0.08) {
      return true;
    }

    element = element.parentElement;
    depth += 1;
  }

  return false;
}

function isElementVisuallyHidden(element, ownerWindow) {
  if (element.hidden || getInputType(element) === "hidden") return true;

  const style = ownerWindow.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity) === 0 ||
    rect.width === 0 ||
    rect.height === 0
  );
}

function isElementProbablyVisible(element, ownerWindow) {
  if (!element || element.hidden) return false;
  if (element.tagName === "INPUT" && getInputType(element) === "hidden") return false;

  const style = ownerWindow.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) !== 0;
}

function createFormGuardSnapshot(forms, formScan, pageContext) {
  const formCount = forms.length;
  const loginFormCount = forms.filter(isCredentialOrLoginForm).length;
  const passwordFieldCount = forms.reduce((count, form) => count + safeCount(form.passwordFieldCount), 0);
  const crossDomainPasswordFormCount = forms.filter((form) => form.actionIsCrossDomain && safeCount(form.passwordFieldCount) > 0).length;
  const insecurePasswordSubmitCount = forms.filter((form) => form.actionProtocol === "http:" && safeCount(form.passwordFieldCount) > 0).length;
  const iframeLoginCount = forms.filter((form) => form.insideIframe && isCredentialOrLoginForm(form)).length;
  const loginOverlayCount = forms.filter((form) => form.loginOverlay).length;
  const actionSignature = forms
    .map((form) =>
      [
        form.id,
        form.method,
        form.actionProtocol,
        form.actionHost,
        form.actionRegistrableDomain,
        form.submitButtonCrossDomainActionCount,
        form.submitButtonInsecureActionCount,
      ].join("|"),
    )
    .join(";");

  return {
    formCount,
    loginFormCount,
    passwordFieldCount,
    crossDomainPasswordFormCount,
    insecurePasswordSubmitCount,
    iframeLoginCount,
    loginOverlayCount,
    blockedIframeCount: formScan.blockedIframeCount,
    suspectedCredentialIframeCount: formScan.suspectedCredentialIframeCount,
    claimedBrandCount: pageContext.claimedBrands.length,
    pageHasLoginText: pageContext.hasLoginText,
    actionSignature,
  };
}

function isCredentialOrLoginForm(form) {
  return (
    safeCount(form.passwordFieldCount) > 0 ||
    safeCount(form.emailFieldCount) > 0 ||
    safeCount(form.userLikeFieldCount) > 0 ||
    form.hasLoginText
  );
}

function updateFormGuardTimeline(trigger, snapshot) {
  const previous = formGuardState.previousSnapshot;

  if (!previous) {
    addTimelineEvent("initial_scan", trigger, snapshot);
  } else {
    if (snapshot.formCount > previous.formCount) {
      addTimelineEvent("form_added", trigger, snapshot);
    }

    if (snapshot.passwordFieldCount > previous.passwordFieldCount) {
      addTimelineEvent(formGuardElapsedMs() > 1500 ? "delayed_password_field" : "password_field_detected", trigger, snapshot);
    }

    if (snapshot.loginFormCount > previous.loginFormCount) {
      addTimelineEvent(formGuardElapsedMs() > 1500 ? "delayed_login_form" : "login_form_detected", trigger, snapshot);
    }

    if (snapshot.actionSignature !== previous.actionSignature && snapshot.formCount > 0 && previous.formCount > 0) {
      addTimelineEvent("form_action_changed", trigger, snapshot);
    }

    if (snapshot.iframeLoginCount > previous.iframeLoginCount) {
      addTimelineEvent("iframe_login_detected", trigger, snapshot);
    }

    if (snapshot.loginOverlayCount > previous.loginOverlayCount) {
      addTimelineEvent("login_overlay_detected", trigger, snapshot);
    }
  }

  if (snapshot.crossDomainPasswordFormCount > 0) {
    addTimelineEvent("cross_domain_password_form", trigger, snapshot);
  }

  if (snapshot.insecurePasswordSubmitCount > 0) {
    addTimelineEvent("insecure_password_submit", trigger, snapshot);
  }

  if (snapshot.suspectedCredentialIframeCount > 0) {
    addTimelineEvent("credential_iframe_seen", trigger, snapshot);
  }

  formGuardState.previousSnapshot = snapshot;
  return formGuardState.timeline;
}

function addTimelineEvent(event, trigger, snapshot) {
  const entry = {
    event,
    trigger,
    elapsedMs: formGuardElapsedMs(),
    formCount: snapshot.formCount,
    loginFormCount: snapshot.loginFormCount,
    passwordFieldCount: snapshot.passwordFieldCount,
    crossDomainPasswordFormCount: snapshot.crossDomainPasswordFormCount,
    insecurePasswordSubmitCount: snapshot.insecurePasswordSubmitCount,
  };
  const dedupeKey = getTimelineDedupeKey(entry);

  if (formGuardState.timeline.some((item) => getTimelineDedupeKey(item) === dedupeKey)) {
    return;
  }

  formGuardState.timeline = [...formGuardState.timeline, entry].slice(-MAX_TIMELINE_EVENTS);
}

function getTimelineDedupeKey(entry) {
  return [
    entry.event,
    entry.formCount,
    entry.loginFormCount,
    entry.passwordFieldCount,
    entry.crossDomainPasswordFormCount,
    entry.insecurePasswordSubmitCount,
  ].join(":");
}

function resetFormGuardForNavigation(safePageUrl) {
  if (formGuardState.pageUrl === safePageUrl) return;

  formGuardState.startedAt = Date.now();
  formGuardState.pageUrl = safePageUrl;
  formGuardState.previousSnapshot = null;
  formGuardState.timeline = [];
}

function formGuardElapsedMs() {
  return Math.max(0, Date.now() - formGuardState.startedAt);
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

function getLimitedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_FRAGMENT_LENGTH);
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
