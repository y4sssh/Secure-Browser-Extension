export function scoreForms({ pageUrl, forms = [], iframeDepth = 0 } = {}) {
  const parsedPageUrl = parseUrl(pageUrl);
  const aggregate = summarizeForms(forms, iframeDepth);
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

  if (aggregate.passwordFieldCount === 0 && aggregate.loginFormCount === 0) {
    return { risk: 0, aggregate, reasons: [] };
  }

  if (aggregate.passwordFieldCount > 0) {
    add(0.08, "Page contains a password field");
  }

  if (aggregate.passwordOnInsecurePageCount > 0) {
    floor(0.86, "Password field appears on an insecure page");
  }

  if (aggregate.crossOriginPasswordFormCount > 0) {
    floor(0.84, "Password form submits to a different origin");
  } else if (aggregate.crossOriginCredentialFormCount > 0) {
    add(0.34, "Credential-looking form submits to a different origin");
  } else if (aggregate.crossOriginFormCount > 0) {
    add(0.12, "A form submits to a different origin");
  }

  if (aggregate.insecurePasswordSubmitCount > 0) {
    floor(0.88, "Password form submits over HTTP");
  } else if (aggregate.insecureSubmitCount > 0) {
    add(0.24, "A form submits over HTTP");
  }

  if (aggregate.passwordGetMethodCount > 0) {
    add(0.22, "Password form uses GET and may expose credentials in the URL");
  }

  if (aggregate.hiddenPasswordFieldCount > 0) {
    add(0.28, "Hidden password field found in a form");
  }

  if (aggregate.invalidActionCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.18, "Password form has an invalid submit destination");
  }

  if (aggregate.autocompleteDisabledCount > 0 && aggregate.passwordFieldCount > 0) {
    add(0.06, "Password form disables browser autocomplete protections");
  }

  if (aggregate.iframeLoginCount > 0) {
    add(0.18, "Login form appears inside an iframe");
  }

  return {
    risk: clampRisk(risk),
    aggregate,
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

export function summarizeForms(forms = [], iframeDepth = 0) {
  const safeForms = Array.isArray(forms) ? forms : [];
  const aggregate = {
    formCount: safeForms.length,
    passwordFieldCount: 0,
    loginFormCount: 0,
    crossOriginFormCount: 0,
    crossOriginCredentialFormCount: 0,
    crossOriginPasswordFormCount: 0,
    insecureSubmitCount: 0,
    insecurePasswordSubmitCount: 0,
    passwordOnInsecurePageCount: 0,
    passwordGetMethodCount: 0,
    hiddenInputCount: 0,
    hiddenPasswordFieldCount: 0,
    autocompleteDisabledCount: 0,
    invalidActionCount: 0,
    iframeLoginCount: 0,
    iframeDepth,
  };

  for (const form of safeForms) {
    const passwordFieldCount = safeCount(form.passwordFieldCount);
    const hiddenPasswordFieldCount = safeCount(form.hiddenPasswordFieldCount);
    const hasCredentials = isCredentialLikeForm(form);
    const isLoginForm = passwordFieldCount > 0 || form.hasLoginText || hasCredentials;

    aggregate.passwordFieldCount += passwordFieldCount;
    aggregate.hiddenInputCount += safeCount(form.hiddenInputCount);
    aggregate.hiddenPasswordFieldCount += hiddenPasswordFieldCount;
    if (isLoginForm) aggregate.loginFormCount += 1;
    if (form.actionIsCrossOrigin) aggregate.crossOriginFormCount += 1;
    if (form.actionIsCrossOrigin && hasCredentials) aggregate.crossOriginCredentialFormCount += 1;
    if (form.actionIsCrossOrigin && passwordFieldCount > 0) aggregate.crossOriginPasswordFormCount += 1;
    if (form.actionProtocol === "http:") aggregate.insecureSubmitCount += 1;
    if (form.actionProtocol === "http:" && passwordFieldCount > 0) aggregate.insecurePasswordSubmitCount += 1;
    if (form.pageProtocol === "http:" && passwordFieldCount > 0) aggregate.passwordOnInsecurePageCount += 1;
    if ((form.method ?? "").toLowerCase() === "get" && passwordFieldCount > 0) aggregate.passwordGetMethodCount += 1;
    if (form.autocompleteDisabled) aggregate.autocompleteDisabledCount += 1;
    if (form.invalidAction) aggregate.invalidActionCount += 1;
    if (form.insideIframe && isLoginForm) aggregate.iframeLoginCount += 1;
  }

  return aggregate;
}

function isCredentialLikeForm(form) {
  return (
    safeCount(form.passwordFieldCount) > 0 ||
    safeCount(form.emailFieldCount) > 0 ||
    safeCount(form.userLikeFieldCount) > 0
  );
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
