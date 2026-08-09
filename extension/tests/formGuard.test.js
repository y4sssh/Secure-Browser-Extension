import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { normalizeEvidence } from "../src/lib/evidence/schema.js";
import { calculateFinalScore } from "../src/lib/scoring/finalScore.js";
import { scoreForms } from "../src/lib/scoring/formScore.js";
import { scoreUrl } from "../src/lib/scoring/urlScore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function evaluate({ pageUrl, forms = [], timeline = [], claimedBrands = [], blockedIframeCount = 0, suspectedCredentialIframeCount = 0 }) {
  const urlResult = scoreUrl(pageUrl, { redirectCount: 0 });
  const formResult = scoreForms({
    pageUrl,
    forms,
    timeline,
    claimedBrands,
    blockedIframeCount,
    suspectedCredentialIframeCount,
  });
  return {
    formResult,
    finalResult: calculateFinalScore({ urlResult, formResult }),
  };
}

test("normal HTTPS page without forms remains trusted", () => {
  const { finalResult } = evaluate({ pageUrl: "https://example.com/news" });

  assert.equal(finalResult.verdict, "trusted");
  assert.equal(finalResult.scores.formRisk, 0);
  assert.ok(finalResult.scores.finalTrustScore >= 80);
});

test("brand-themed password form posting to another domain is high risk", () => {
  const { finalResult, formResult } = evaluate({
    pageUrl: "https://login-example.test/account",
    claimedBrands: ["Microsoft"],
    forms: [
      {
        method: "post",
        pageProtocol: "https:",
        actionProtocol: "https:",
        actionHost: "credential-capture.example.test",
        actionIsCrossOrigin: true,
        actionIsCrossDomain: true,
        passwordFieldCount: 1,
        emailFieldCount: 1,
        hasLoginText: true,
        claimedBrands: ["Microsoft"],
        brandDomainMismatch: true,
      },
    ],
  });

  assert.equal(finalResult.verdict, "high_risk");
  assert.ok(finalResult.scores.finalTrustScore <= 19);
  assert.equal(formResult.aggregate.brandedCrossDomainCredentialFormCount, 1);
  assert.ok(finalResult.reasons.includes("Page claims Microsoft identity but the credential form posts to a non-brand domain"));
  assert.ok(finalResult.reasons.includes("Password form submits to a different domain"));
});

test("delayed injected login form is high risk and explained", () => {
  const { finalResult, formResult } = evaluate({
    pageUrl: "https://example.test/account",
    timeline: [
      {
        event: "delayed_password_field",
        elapsedMs: 2600,
        formCount: 1,
        loginFormCount: 1,
        passwordFieldCount: 1,
        crossDomainPasswordFormCount: 0,
        insecurePasswordSubmitCount: 0,
      },
    ],
    forms: [
      {
        method: "post",
        pageProtocol: "https:",
        actionProtocol: "https:",
        actionHost: "example.test",
        actionIsCrossOrigin: false,
        actionIsCrossDomain: false,
        passwordFieldCount: 1,
        emailFieldCount: 1,
        hasLoginText: true,
        loginOverlay: true,
      },
    ],
  });

  assert.equal(finalResult.verdict, "high_risk");
  assert.equal(formResult.aggregate.delayedPasswordFieldCount, 1);
  assert.ok(finalResult.reasons.includes("Login form appeared after page load"));
  assert.ok(finalResult.reasons.includes("Credential form appears inside an overlay"));
});

test("HTTP page asking for password is high risk", () => {
  const { finalResult, formResult } = evaluate({
    pageUrl: "http://example.test/login",
    forms: [
      {
        method: "post",
        pageProtocol: "http:",
        actionProtocol: "http:",
        actionHost: "example.test",
        actionIsCrossOrigin: false,
        actionIsCrossDomain: false,
        passwordFieldCount: 1,
        userLikeFieldCount: 1,
        hasLoginText: true,
      },
    ],
  });

  assert.equal(finalResult.verdict, "high_risk");
  assert.equal(formResult.aggregate.passwordOnInsecurePageCount, 1);
  assert.ok(finalResult.reasons.includes("HTTP page asks for a password"));
  assert.ok(finalResult.reasons.includes("Password form submits over HTTP"));
});

test("form action changes after load are high risk when credentials are present", () => {
  const { finalResult, formResult } = evaluate({
    pageUrl: "https://example.test/login",
    timeline: [
      {
        event: "form_action_changed",
        elapsedMs: 2000,
        formCount: 1,
        loginFormCount: 1,
        passwordFieldCount: 1,
        crossDomainPasswordFormCount: 1,
        insecurePasswordSubmitCount: 0,
      },
    ],
    forms: [
      {
        method: "post",
        pageProtocol: "https:",
        actionProtocol: "https:",
        actionHost: "credential-capture.example.test",
        actionIsCrossOrigin: true,
        actionIsCrossDomain: true,
        passwordFieldCount: 1,
        userLikeFieldCount: 1,
        hasLoginText: true,
      },
    ],
  });

  assert.equal(finalResult.verdict, "high_risk");
  assert.equal(formResult.aggregate.actionChangedCount, 1);
  assert.ok(finalResult.reasons.includes("Form submit destination changed after page load"));
});

test("iframe login evidence is counted and explained", () => {
  const { finalResult, formResult } = evaluate({
    pageUrl: "https://example.test/account",
    forms: [
      {
        method: "post",
        pageProtocol: "https:",
        actionProtocol: "https:",
        actionHost: "example.test",
        actionIsCrossOrigin: false,
        actionIsCrossDomain: false,
        passwordFieldCount: 1,
        emailFieldCount: 1,
        hasLoginText: true,
        insideIframe: true,
        iframeDepth: 1,
      },
    ],
  });

  assert.equal(formResult.aggregate.iframeLoginCount, 1);
  assert.ok(finalResult.reasons.includes("Login form appears inside an iframe"));
});

test("normalization preserves capped FormGuard evidence and sanitizes URLs", () => {
  const evidence = normalizeEvidence({
    url: "https://example.test/path?token=secret#frag",
    scores: { finalTrustScore: 12, formRisk: 0.88 },
    signals: { claimedBrands: ["Microsoft", "Microsoft", "Google", "PayPal", "Amazon", "Apple"] },
    forms: [
      {
        id: "form-0-0",
        actionHost: "credential-capture.example.test",
        passwordFieldCount: 1,
        claimedBrands: ["Microsoft"],
        brandDomainMismatch: true,
      },
    ],
    formGuard: {
      claimedBrands: ["Microsoft", "Google", "PayPal", "Amazon", "Apple"],
      timeline: Array.from({ length: 14 }, (_, index) => ({
        event: `event_${index}`,
        trigger: "test",
        elapsedMs: index,
      })),
    },
    reasons: ["Password form submits to a different domain"],
  });

  assert.equal(evidence.schemaVersion, 3);
  assert.equal(evidence.url, "https://example.test/path");
  assert.deepEqual(evidence.signals.claimedBrands, ["Microsoft", "Google", "PayPal", "Amazon"]);
  assert.equal(evidence.formGuard.timeline.length, 12);
  assert.equal(evidence.forms[0].passwordFieldCount, 1);
  assert.equal(evidence.forms[0].brandDomainMismatch, true);
});

test("normalization preserves capped BrandGuard and text evidence", () => {
  const evidence = normalizeEvidence({
    url: "https://login-example.test/account?token=secret#frag",
    scores: { finalTrustScore: 8, brandRisk: 0.92 },
    brandGuard: {
      actualHostname: "login-example.test",
      actualDomain: "login-example.test",
      claimedBrand: "Microsoft",
      claimedBrands: ["Microsoft", "Google", "PayPal", "Amazon", "Apple"],
      expectedDomains: ["microsoft.com", "microsoftonline.com", "live.com", "office.com", "outlook.com"],
      domainMismatch: true,
      credentialContext: true,
      textRisk: 0.42,
      textSnippetCount: 14,
      textSources: ["title", "heading", "button"],
      cloudAnalysisEligible: true,
      localModelVersion: "brandguard-text-rules-v1",
    },
    textSignals: {
      snippets: Array.from({ length: 14 }, (_, index) => ({
        source: "heading",
        text: `Microsoft sign in ${index} ${"x".repeat(140)}`,
      })),
      redactions: { emails: 1, numbers: 2, tokens: 3, longStrings: 4 },
      redactionCount: 10,
      hasLoginText: true,
      loginTextSignalCount: 3,
      claimedBrands: ["Microsoft"],
    },
  });

  assert.equal(evidence.url, "https://login-example.test/account");
  assert.equal(evidence.brandGuard.claimedBrand, "Microsoft");
  assert.deepEqual(evidence.brandGuard.claimedBrands, ["Microsoft", "Google", "PayPal", "Amazon"]);
  assert.equal(evidence.brandGuard.domainMismatch, true);
  assert.equal(evidence.textSignals.snippets.length, 12);
  assert.equal(evidence.textSignals.snippets[0].text.length, 120);
  assert.equal(evidence.signals.brandDomainMismatch, true);
});

test("content scanning code does not read typed field values", () => {
  const contentScript = readFileSync(resolve(__dirname, "../src/content/contentScript.js"), "utf8");
  const pageScanner = readFileSync(resolve(__dirname, "../src/content/pageScanner.js"), "utf8");

  assert.doesNotMatch(contentScript, /(?:input|element|field|form)\.value\b/);
  assert.doesNotMatch(pageScanner, /(?:input|element|field|form)\.value\b/);
});
