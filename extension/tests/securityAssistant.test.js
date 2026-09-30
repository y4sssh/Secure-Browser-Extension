import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explainSecurityRiskLocally,
  prepareAssistantEvidence,
} from "../src/lib/securityAssistant.js";
import {
  hasOptionalPermission,
  requestOptionalPermission,
} from "../src/lib/chrome/runtime.js";
import { fetchChatExplain } from "../src/lib/backendClient.js";

test("assistant allow-lists evidence and redacts values before a response can use it", () => {
  const uniqueSecret = "SENTINEL-password-value-should-not-leave";
  const evidence = {
    url: `https://login.example.test/account?token=${uniqueSecret}`,
    verdict: "high_risk",
    scores: { finalTrustScore: 15, urlRisk: 0.8, formRisk: 0.9 },
    reasons: [`Password=${uniqueSecret}`, "Password form submits to a different domain"],
    signals: {
      formPostsCrossDomain: true,
      redirectCount: 3,
      ignoredSensitiveField: uniqueSecret,
    },
    password: uniqueSecret,
    cookie: `session=${uniqueSecret}`,
  };

  const prepared = prepareAssistantEvidence(evidence);
  const serialized = JSON.stringify(prepared);

  assert.equal(prepared.hostname, "login.example.test");
  assert.equal(prepared.signals.formPostsCrossDomain, true);
  assert.equal(prepared.signals.ignoredSensitiveField, undefined);
  assert.ok(prepared.reasons[0].includes("[redacted]"));
  assert.ok(!serialized.includes(uniqueSecret));
  assert.ok(!serialized.includes("/account?token"));
});

test("local assistant explains the evidence when the optional backend is unavailable", () => {
  const result = explainSecurityRiskLocally("What should I do?", {
    hostname: "signin.example.test",
    verdict: "high_risk",
    scores: { finalTrustScore: 12 },
    reasons: ["Password form submits to a different domain"],
    signals: { formPostsCrossDomain: true },
  });

  assert.equal(result.source, "local");
  assert.match(result.answer, /Do not enter credentials/i);
  assert.match(result.answer, /signin\.example\.test/);
});

test("backend client applies the same evidence filter at the network boundary", async () => {
  const originalFetch = globalThis.fetch;
  let requestPayload = null;
  globalThis.fetch = async (_url, options) => {
    requestPayload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ answer: "ok" }) };
  };

  try {
    await fetchChatExplain("Why is this risky?", {
      url: "https://example.test/login?token=NETWORK-SENTINEL",
      password: "NETWORK-SENTINEL",
      hostname: "example.test",
      verdict: "risky",
      reasons: ["token=NETWORK-SENTINEL"],
    });
    const serialized = JSON.stringify(requestPayload);
    assert.equal(requestPayload.evidence.hostname, "example.test");
    assert.ok(!serialized.includes("NETWORK-SENTINEL"));
    assert.ok(!serialized.includes("/login?token"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("local assistant explains broader website risks even when the current page appears trusted", () => {
  const result = explainSecurityRiskLocally("Why is this page risky?", {
    hostname: "chatgpt.com",
    verdict: "trusted",
    scores: { finalTrustScore: 90 },
    reasons: ["No high-risk page, URL, or form signals found"],
    signals: { https: true },
  });

  assert.equal(result.source, "local");
  assert.match(result.answer, /phishing|login|cookies|downloads|extensions|tracking/i);
  assert.doesNotMatch(result.answer, /This page is considered trusted\./i);
});

test("risky page lock screen is injected with explicit continue and close actions", async () => {
  const fs = await import("node:fs");
  const contentScriptPath = new URL("../src/content/contentScript.js", import.meta.url);
  const messageTypesPath = new URL("../src/lib/chrome/messageTypes.js", import.meta.url);
  const contentScript = fs.readFileSync(contentScriptPath, "utf8");
  const messageTypes = fs.readFileSync(messageTypesPath, "utf8");

  assert.ok(contentScript.includes("Continue anyway"), "Overlay should offer a continue choice");
  assert.ok(contentScript.includes("Close tab"), "Overlay should offer a close-tab action");
  assert.ok(contentScript.includes("riskLockdown"), "Content script should handle a risky-page lockdown message");
  assert.ok(contentScript.includes("Ignore for this site"), "Overlay should offer a site-level ignore option");
  assert.ok(contentScript.includes("Recommended action"), "Overlay should surface a clear recommendation text");
  assert.ok(messageTypes.includes("RISK_LOCKDOWN"), "Background message types should include the lockdown trigger");
});

test("consent panel exposes a toggle for the risk lockdown overlay", async () => {
  const fs = await import("node:fs");
  const consentPanelPath = new URL("../src/components/ConsentPanel.jsx", import.meta.url);
  const consentPanel = fs.readFileSync(consentPanelPath, "utf8");

  assert.ok(consentPanel.includes("riskLockdownEnabled"), "Consent panel should include the risk-lockdown toggle");
  assert.ok(consentPanel.includes("Risk lockdown overlay"), "Consent panel should label the global lockdown setting");
});

test("risk lockdown triggers before a page only reaches the highest-risk bucket", async () => {
  const fs = await import("node:fs");
  const routerPath = new URL("../src/background/messageRouter.js", import.meta.url);
  const router = fs.readFileSync(routerPath, "utf8");

  assert.ok(router.includes("shouldTriggerRiskLockdownForEvidence"), "Background router should gate the overlay via a dedicated helper");
  assert.ok(router.includes("verdict === \"caution\""), "Caution-tier pages should still trigger the overlay when the score is suspicious");
});

test("extension health panel collapses repeated identical scans", async () => {
  const fs = await import("node:fs");
  const extensionHealthPath = new URL("../src/components/ExtensionHealthPanel.jsx", import.meta.url);
  const extensionHealth = fs.readFileSync(extensionHealthPath, "utf8");

  assert.ok(extensionHealth.includes("deduplicatedScans"), "Panel should collapse repeated extension-scan entries before rendering");
});

test("optional permission helpers return the browser decision and check the current state", async () => {
  const originalChrome = globalThis.chrome;
  let requestedPermission = null;
  globalThis.chrome = {
    runtime: { id: "test-extension", lastError: null },
    permissions: {
      request(details, callback) {
        requestedPermission = details.permissions[0];
        callback(true);
      },
      contains(details, callback) {
        callback(details.permissions[0] === "management");
      },
    },
  };

  try {
    const requestResult = await requestOptionalPermission("management");
    assert.equal(requestedPermission, "management");
    assert.equal(requestResult.granted, true);
    assert.equal(await hasOptionalPermission("management"), true);
    assert.equal(await hasOptionalPermission("cookies"), false);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
