import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreBehavioralSignals } from "../src/lib/scoring/behavioralSignals.js";
import { scoreVisualBrandMismatch } from "../src/lib/scoring/visualBrandMismatch.js";
import { runHybridRiskModel } from "../src/lib/scoring/modelPipeline.js";
import { loadUserRiskPolicy, evaluateUserRiskPolicy, saveUserRiskPolicy } from "../src/lib/policy/userRiskPolicy.js";

test("visual brand mismatch detector catches impersonation patterns", () => {
  const result = scoreVisualBrandMismatch({
    pageUrl: "https://amazon-signin.example/verify",
    hostname: "amazon-signin.example",
    title: "Microsoft account access",
    favicon: "https://login.microsoftonline.com/favicon.ico",
    textSignals: {
      snippets: [
        { source: "title", text: "Microsoft account access" },
        { source: "heading", text: "Sign in to continue" },
      ],
      claimedBrands: ["Microsoft"],
      hasLoginText: true,
    },
    forms: [{ passwordFieldCount: 1, claimedBrands: ["Microsoft"], hasLoginText: true }],
  });

  assert.equal(result.detectedBrand, "Microsoft");
  assert.equal(result.mismatch, true);
  assert.ok(result.risk >= 0.62);
  assert.ok(result.reasons.some((reason) => /Microsoft|brand/i.test(reason)));
});

test("behavioral detector flags deceptive credential flows before the user enters data", () => {
  const result = scoreBehavioralSignals({
    hostname: "signin-microsoft.example",
    forms: [
      {
        passwordFieldCount: 1,
        hiddenPasswordFieldCount: 1,
        hiddenCredentialFieldCount: 1,
        antiAnalysisSignalCount: 1,
        actionIsCrossOrigin: true,
        hasLoginText: true,
      },
    ],
    timeline: [
      { event: "form_action_changed" },
      { event: "delayed_password_field" },
    ],
    redirectCount: 2,
    brandRisk: 0.8,
  });

  assert.ok(result.risk >= 0.72, "behavior risk should be elevated for deceptive login behavior");
  assert.ok(
    result.reasons.some((reason) => /redirect|form action|hidden|behavior/i.test(reason.message ?? reason)),
  );
});

test("hybrid model merges heuristic, behavioral, and reputation signals with a stable version", () => {
  const modelOutput = runHybridRiskModel({
    urlRisk: 0.71,
    formRisk: 0.82,
    brandRisk: 0.86,
    visualRisk: 0.91,
    behavioralRisk: 0.83,
    reputationRisk: 0.76,
    payload: { hostname: "signin-microsoft.example" },
  });

  assert.equal(modelOutput.modelVersion, "secure-browser-hybrid-v1");
  assert.equal(modelOutput.behavioralRisk, 0.83);
  assert.equal(modelOutput.reputationRisk, 0.76);
  assert.ok(modelOutput.finalScore >= 0);
  assert.ok(modelOutput.finalScore <= 100);
  assert.ok(modelOutput.reasons.some((reason) => /visual|brand|behavior|reputation|model/i.test(reason)));
});

test("user policy engine blocks malicious domains and protects trusted brands", () => {
  const policy = loadUserRiskPolicy({
    allowList: ["login.microsoftonline.com", "accounts.google.com"],
    blockList: ["evil-login.example", "amazon-signin.example"],
    riskThreshold: 75,
  });

  const blocked = evaluateUserRiskPolicy(policy, {
    hostname: "evil-login.example",
    finalTrustScore: 18,
  });
  const trusted = evaluateUserRiskPolicy(policy, {
    hostname: "login.microsoftonline.com",
    finalTrustScore: 82,
  });
  const risky = evaluateUserRiskPolicy(policy, {
    hostname: "office-login.example",
    finalTrustScore: 40,
    reasons: ["Brand impersonation"],
  });

  assert.equal(blocked.action, "block");
  assert.equal(trusted.action, "allow");
  assert.equal(risky.action, "warn");
});

test("user policy save tolerates unavailable or blocked storage", () => {
  const badStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("Storage unavailable");
    },
  };

  assert.doesNotThrow(() => {
    saveUserRiskPolicy({
      allowList: ["login.microsoftonline.com"],
      blockList: ["evil-login.example"],
      riskThreshold: 80,
      warnThreshold: 30,
    }, badStorage);
  });
});
