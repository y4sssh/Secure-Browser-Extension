export function scoreForms({
  pageUrl,
  forms = [],
  iframeDepth = 0,
  blockedIframeCount = 0,
  suspectedCredentialIframeCount = 0,
  claimedBrands = [],
  timeline = [],
} = {}) {
  const parsedPageUrl = parseUrl(pageUrl);
  const aggregate = summarizeForms(forms, {
    iframeDepth,
    blockedIframeCount,
    suspectedCredentialIframeCount,
    claimedBrands,
    timeline,
  });
  const reasons = [];
  let risk = 0;

  const add = (weight, message) => {
    risk += weight;
    reasons.push({ source: "form", weight, message });
  };

  const floor = (minimumRisk, message) => {
    risk = Math.max(risk, minimumRisk);
    reasons.push({ source: "form", weight: minimumRisk, message });
  };

  if (!parsedPageUrl) {
    add(0.18, "Page URL could not be parsed before form analysis");
  }

  if (aggregate.passwordFieldCount === 0 && aggregate.loginFormCount === 0 && aggregate.suspectedCredentialIframeCount === 0) {
    return { risk: 0, aggregate, reasons: [] };
  }

  if (aggregate.passwordFieldCount > 0) {
    add(0.08, "Page contains a password field");
  }

  if (aggregate.brandedCrossDomainCredentialFormCount > 0) {
    const brand = aggregate.primaryClaimedBrand || "a known brand";
    floor(0.92, `Page claims ${brand} identity but the credential form posts to a non-brand domain`);
  }

  if (aggregate.passwordOnInsecurePageCount > 0) {
    floor(0.88, "HTTP page asks for a password");
  }

  if (aggregate.crossDomainPasswordFormCount > 0) {
    floor(0.9, "Password form submits to a different domain");
  } else if (aggregate.crossOriginPasswordFormCount > 0) {
    floor(0.78, "Password form submits to a different origin");
  } else if (aggregate.crossDomainCredentialFormCount > 0) {
    add(0.38, "Credential-looking form submits to a different domain");
  } else if (aggregate.crossOriginCredentialFormCount > 0) {
    add(0.3, "Credential-looking form submits to a different origin");
  } else if (aggregate.crossDomainFormCount > 0 || aggregate.crossOriginFormCount > 0) {
    add(0.12, "A form submits away from the current page");
  }

  if (aggregate.insecurePasswordSubmitCount > 0) {
    floor(0.9, "Password form submits over HTTP");
  } else if (aggregate.insecureSubmitCount > 0) {
    add(0.24, "A form submits over HTTP");
  }

  if (aggregate.submitButtonCrossDomainActionCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.28, "A credential submit button overrides the form destination");
  }

  if (aggregate.submitButtonInsecureActionCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.32, "A credential submit button can send data over HTTP");
  }

  if (aggregate.delayedPasswordFieldCount > 0 || aggregate.delayedLoginFormCount > 0) {
    floor(0.82, "Login form appeared after page load");
  }

  if (aggregate.actionChangedCount > 0) {
    floor(aggregate.passwordFieldCount > 0 ? 0.8 : 0.56, "Form submit destination changed after page load");
  }

  if (aggregate.passwordGetMethodCount > 0) {
    add(0.22, "Password form uses GET and may expose credentials in the URL");
  }

  if (aggregate.hiddenPasswordFieldCount > 0) {
    add(0.28, "Hidden password field found in a form");
  }

  if (aggregate.hiddenCredentialFieldCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.14, "Credential metadata is hidden inside a password form");
  }

  if (aggregate.invalidActionCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.18, "Password form has an invalid submit destination");
  }

  if (aggregate.autocompleteDisabledCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.06, "Password form disables browser autocomplete protections");
  }

  if (aggregate.antiAnalysisSignalCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.08, "Password form uses anti-analysis interaction controls");
  }

  if (aggregate.readonlyPasswordFieldCount > 0) {
    add(0.06, "Password field is disabled or read-only during analysis");
  }

  if (aggregate.iframeLoginCount > 0) {
    add(0.22, "Login form appears inside an iframe");
  }

  if (aggregate.suspectedCredentialIframeCount > 0 && aggregate.blockedIframeCount > 0) {
    add(0.16, "Login-looking iframe could not be inspected directly");
  }

  if (aggregate.loginOverlayCount > 0) {
    add(0.18, "Credential form appears inside an overlay");
  }

  return {
    risk: clampRisk(risk),
    aggregate,
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

export function summarizeForms(forms = [], optionsOrIframeDepth = 0) {
  const safeForms = Array.isArray(forms) ? forms : [];
  const options =
    typeof optionsOrIframeDepth === "number"
      ? { iframeDepth: optionsOrIframeDepth }
      : optionsOrIframeDepth ?? {};
  const timeline = Array.isArray(options.timeline) ? options.timeline : [];
  const claimedBrands = normalizeBrands(options.claimedBrands);
  const aggregate = {
    formCount: safeForms.length,
    passwordFieldCount: 0,
    loginFormCount: 0,
    crossOriginFormCount: 0,
    crossOriginCredentialFormCount: 0,
    crossOriginPasswordFormCount: 0,
    crossDomainFormCount: 0,
    crossDomainCredentialFormCount: 0,
    crossDomainPasswordFormCount: 0,
    brandedCrossDomainCredentialFormCount: 0,
    insecureSubmitCount: 0,
    insecurePasswordSubmitCount: 0,
    passwordOnInsecurePageCount: 0,
    passwordGetMethodCount: 0,
    hiddenInputCount: 0,
    hiddenPasswordFieldCount: 0,
    hiddenCredentialFieldCount: 0,
    readonlyPasswordFieldCount: 0,
    autocompleteDisabledCount: 0,
    antiAnalysisSignalCount: 0,
    invalidActionCount: 0,
    iframeLoginCount: 0,
    blockedIframeCount: safeCount(options.blockedIframeCount),
    suspectedCredentialIframeCount: safeCount(options.suspectedCredentialIframeCount),
    loginOverlayCount: 0,
    submitButtonActionCount: 0,
    submitButtonCrossDomainActionCount: 0,
    submitButtonInsecureActionCount: 0,
    delayedPasswordFieldCount: countTimelineEvent(timeline, "delayed_password_field"),
    delayedLoginFormCount: countTimelineEvent(timeline, "delayed_login_form"),
    actionChangedCount: countTimelineEvent(timeline, "form_action_changed"),
    timelineEventCount: timeline.length,
    claimedBrands,
    primaryClaimedBrand: claimedBrands[0] ?? "",
    iframeDepth: safeCount(options.iframeDepth),
  };

  for (const form of safeForms) {
    const passwordFieldCount = safeCount(form.passwordFieldCount);
    const hiddenPasswordFieldCount = safeCount(form.hiddenPasswordFieldCount);
    const hasCredentials = isCredentialLikeForm(form);
    const isLoginForm = passwordFieldCount > 0 || form.hasLoginText || hasCredentials;

    aggregate.passwordFieldCount += passwordFieldCount;
    aggregate.hiddenInputCount += safeCount(form.hiddenInputCount);
    aggregate.hiddenPasswordFieldCount += hiddenPasswordFieldCount;
    aggregate.hiddenCredentialFieldCount += safeCount(form.hiddenCredentialFieldCount);
    aggregate.readonlyPasswordFieldCount += safeCount(form.readonlyPasswordFieldCount);
    aggregate.antiAnalysisSignalCount += safeCount(form.antiAnalysisSignalCount) + (form.pasteBlocked ? 1 : 0);
    aggregate.submitButtonActionCount += safeCount(form.submitButtonActionCount);
    aggregate.submitButtonCrossDomainActionCount += safeCount(form.submitButtonCrossDomainActionCount);
    aggregate.submitButtonInsecureActionCount += safeCount(form.submitButtonInsecureActionCount);
    if (isLoginForm) aggregate.loginFormCount += 1;
    if (form.actionIsCrossOrigin) aggregate.crossOriginFormCount += 1;
    if (form.actionIsCrossOrigin && hasCredentials) aggregate.crossOriginCredentialFormCount += 1;
    if (form.actionIsCrossOrigin && passwordFieldCount > 0) aggregate.crossOriginPasswordFormCount += 1;
    if (form.actionIsCrossDomain) aggregate.crossDomainFormCount += 1;
    if (form.actionIsCrossDomain && hasCredentials) aggregate.crossDomainCredentialFormCount += 1;
    if (form.actionIsCrossDomain && passwordFieldCount > 0) aggregate.crossDomainPasswordFormCount += 1;
    if (form.brandDomainMismatch && hasCredentials) aggregate.brandedCrossDomainCredentialFormCount += 1;
    if (form.actionProtocol === "http:" || safeCount(form.submitButtonInsecureActionCount) > 0) aggregate.insecureSubmitCount += 1;
    if ((form.actionProtocol === "http:" || safeCount(form.submitButtonInsecureActionCount) > 0) && passwordFieldCount > 0) {
      aggregate.insecurePasswordSubmitCount += 1;
    }
    if (form.pageProtocol === "http:" && passwordFieldCount > 0) aggregate.passwordOnInsecurePageCount += 1;
    if ((form.method ?? "").toLowerCase() === "get" && passwordFieldCount > 0) aggregate.passwordGetMethodCount += 1;
    if (form.autocompleteDisabled) aggregate.autocompleteDisabledCount += 1;
    if (form.invalidAction) aggregate.invalidActionCount += 1;
    if (form.insideIframe && isLoginForm) aggregate.iframeLoginCount += 1;
    if (form.loginOverlay) aggregate.loginOverlayCount += 1;

    for (const brand of normalizeBrands(form.claimedBrands)) {
      if (!aggregate.claimedBrands.includes(brand)) {
        aggregate.claimedBrands.push(brand);
      }
    }
  }

  aggregate.primaryClaimedBrand = aggregate.claimedBrands[0] ?? "";
  return aggregate;
}

function isCredentialLikeForm(form) {
  return (
    safeCount(form.passwordFieldCount) > 0 ||
    safeCount(form.emailFieldCount) > 0 ||
    safeCount(form.userLikeFieldCount) > 0 ||
    safeCount(form.loginTextSignalCount) > 0
  );
}

function normalizeBrands(brands) {
  if (!Array.isArray(brands)) return [];
  return brands
    .filter((brand) => typeof brand === "string" && brand.trim().length > 0)
    .map((brand) => brand.trim())
    .filter((brand, index, allBrands) => allBrands.indexOf(brand) === index)
    .slice(0, 4);
}

function countTimelineEvent(timeline, eventName) {
  return timeline.filter((entry) => entry?.event === eventName).length;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
