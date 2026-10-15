import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreBrandGuard, scoreTextSignals } from "../src/lib/scoring/brandGuardScore.js";
import { calculateFinalScore } from "../src/lib/scoring/finalScore.js";
import { scoreForms } from "../src/lib/scoring/formScore.js";
import { scoreUrl } from "../src/lib/scoring/urlScore.js";
import { scoreVisualBrandMismatch } from "../src/lib/scoring/visualBrandMismatch.js";

const FAKE_BRAND_CASES = [
  {
    brand: "Microsoft",
    pageUrl: "https://login-example.test/microsoft/account",
    snippets: ["Microsoft account", "Sign in to continue", "Security alert: verify your password"],
  },
  {
    brand: "Google",
    pageUrl: "https://secure-update.test/google/session",
    snippets: ["Google account recovery", "Sign in with email", "Confirm account access"],
  },
  {
    brand: "PayPal",
    pageUrl: "https://billing-review.test/paypal/login",
    snippets: ["PayPal wallet review", "Log in to resolve limited access", "Continue securely"],
  },
];

function credentialFormFor(pageUrl) {
  const url = new URL(pageUrl);

  return {
    method: "post",
    pageProtocol: "https:",
    actionProtocol: "https:",
    actionHost: url.hostname,
    actionIsCrossOrigin: false,
    actionIsCrossDomain: false,
    passwordFieldCount: 1,
    emailFieldCount: 1,
    hasLoginText: true,
  };
}

function textSignalsFor(snippets, brand) {
  return {
    snippets: snippets.map((text, index) => ({ source: index === 0 ? "title" : "heading", text })),
    snippetCount: snippets.length,
    hasLoginText: true,
    loginTextSignalCount: snippets.length,
    claimedBrands: [brand],
  };
}

test("BrandGuard detects fake Microsoft, Google, and PayPal login pages by actual-domain mismatch", () => {
  for (const item of FAKE_BRAND_CASES) {
    const forms = [credentialFormFor(item.pageUrl)];
    const urlResult = scoreUrl(item.pageUrl);
    const formResult = scoreForms({
      pageUrl: item.pageUrl,
      forms,
      claimedBrands: [item.brand],
      timeline: [],
    });
    const brandResult = scoreBrandGuard({
      pageUrl: item.pageUrl,
      claimedBrands: [item.brand],
      forms,
      textSignals: textSignalsFor(item.snippets, item.brand),
      urlFeatures: urlResult.features,
    });
    const finalResult = calculateFinalScore({ urlResult, formResult, brandResult });

    assert.equal(brandResult.features.domainMismatch, true);
    assert.equal(brandResult.features.claimedBrand, item.brand);
    assert.ok(brandResult.risk >= 0.9);
    assert.equal(finalResult.verdict, "high_risk");
    assert.ok(
      finalResult.reasons.some((reason) => reason.includes(`Page claims ${item.brand} identity but actual domain is`)),
    );
  }
});

test("BrandGuard allows a claimed Microsoft login on an expected Microsoft domain", () => {
  const pageUrl = "https://login.microsoftonline.com/common/oauth2";
  const forms = [credentialFormFor(pageUrl)];
  const brandResult = scoreBrandGuard({
    pageUrl,
    claimedBrands: ["Microsoft"],
    forms,
    textSignals: textSignalsFor(["Microsoft account", "Sign in"], "Microsoft"),
  });

  assert.equal(brandResult.features.domainMismatch, false);
  assert.ok(brandResult.risk < 0.5);
});

test("legitimate branded login pages retain a trusted score", () => {
  const pageUrl = "https://accounts.google.com/signin/v2/identifier";
  const forms = [credentialFormFor(pageUrl)];
  const textSignals = textSignalsFor(["Google Account", "Sign in", "Verify it is you"], "Google");
  const urlResult = scoreUrl(pageUrl);
  const formResult = scoreForms({ pageUrl, forms, claimedBrands: ["Google"] });
  const brandResult = scoreBrandGuard({
    pageUrl,
    claimedBrands: ["Google"],
    forms,
    textSignals,
    urlFeatures: urlResult.features,
  });
  const visualResult = scoreVisualBrandMismatch({
    pageUrl,
    hostname: "accounts.google.com",
    title: "Sign in - Google Accounts",
    favicon: "https://accounts.google.com/favicon.ico",
    textSignals,
    forms,
  });
  const finalResult = calculateFinalScore({ urlResult, formResult, brandResult, visualResult, hostname: "accounts.google.com" });

  assert.equal(brandResult.features.domainMismatch, false);
  assert.equal(brandResult.risk, 0);
  assert.equal(visualResult.mismatch, false);
  assert.equal(visualResult.risk, 0);
  assert.equal(finalResult.verdict, "trusted");
  assert.ok(finalResult.scores.finalTrustScore >= 80);
});

test("Instagram's verified domain is not downgraded for its dynamically rendered login UI", () => {
  const pageUrl = "https://www.instagram.com/";
  const forms = [{
    ...credentialFormFor(pageUrl),
    loginOverlay: true,
  }];
  const textSignals = textSignalsFor(["Instagram", "Log in to Instagram"], "Instagram");
  const urlResult = scoreUrl(pageUrl);
  const brandResult = scoreBrandGuard({
    pageUrl,
    claimedBrands: ["Instagram"],
    forms,
    textSignals,
    urlFeatures: urlResult.features,
  });
  const trustedBrandHost = brandResult.features.claimedBrands.length > 0 && !brandResult.features.domainMismatch;
  const formResult = scoreForms({
    pageUrl,
    forms,
    claimedBrands: ["Instagram"],
    trustedBrandHost,
    timeline: [{ event: "delayed_password_field" }, { event: "login_overlay_detected" }],
  });
  const finalResult = calculateFinalScore({ urlResult, formResult, brandResult, hostname: "www.instagram.com" });

  assert.equal(trustedBrandHost, true);
  assert.equal(formResult.risk, 0.08);
  assert.equal(finalResult.verdict, "trusted");
  assert.ok(finalResult.scores.finalTrustScore >= 80);
});

test("safe text scoring uses snippets without requiring full page body", () => {
  const textResult = scoreTextSignals({
    snippets: [
      { source: "title", text: "PayPal security alert" },
      { source: "button", text: "Verify account" },
    ],
  });

  assert.equal(textResult.features.snippetCount, 2);
  assert.equal(textResult.features.hasUrgencyCue, true);
  assert.ok(textResult.risk > 0.2);
});
