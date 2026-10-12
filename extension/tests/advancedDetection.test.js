import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreVisualBrandMismatch } from "../src/lib/scoring/visualBrandMismatch.js";
import { runHybridRiskModel } from "../src/lib/scoring/modelPipeline.js";
import { loadUserRiskPolicy, evaluateUserRiskPolicy } from "../src/lib/policy/userRiskPolicy.js";

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

test("hybrid model merges heuristic and visual signals with a stable version", () => {
  const modelOutput = runHybridRiskModel({
    urlRisk: 0.71,
    formRisk: 0.82,
    brandRisk: 0.86,
    visualRisk: 0.91,
    payload: { hostname: "signin-microsoft.example" },
  });

  assert.equal(modelOutput.modelVersion, "secure-browser-hybrid-v1");
  assert.ok(modelOutput.finalScore >= 0);
  assert.ok(modelOutput.finalScore <= 100);
  assert.ok(modelOutput.reasons.some((reason) => /visual|brand|model/i.test(reason)));
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
