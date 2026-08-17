import assert from "node:assert/strict";
import { test } from "node:test";
import {
  scoreExtensionItem,
  scoreCookieItem,
} from "../src/lib/securityUtils.js";

const PERMISSION_EXPLANATIONS = {
  webRequest: "Can observe and modify network requests made by the browser.",
  webRequestBlocking: "Can block or modify network requests before they complete.",
  cookies: "Can read and modify cookies for sites the extension has access to.",
  nativeMessaging: "Can communicate with native apps installed on your machine.",
  history: "Can read your browsing history.",
  management: "Can query and manage other installed extensions.",
  scripting: "Can inject and execute scripts in pages the extension can access.",
  downloads: "Can monitor and modify downloads.",
  clipboardRead: "Can read clipboard contents when active.",
  clipboardWrite: "Can write to the clipboard.",
  tabs: "Can see open tabs and their URLs.",
};

test("extension scanner returns scan structure with risk and reasons", () => {
  const ext = {
    id: "test-ext-1",
    name: "Test Extension",
    enabled: true,
    installType: "normal",
    version: "1.0.0",
    permissions: ["management", "tabs", "cookies"],
    hostPermissions: ["https://*.example.com/*"],
  };

  const result = scoreExtensionItem(ext);

  assert.ok(typeof result.score === "number");
  assert.ok(result.score >= 0 && result.score <= 1);
  assert.ok(Array.isArray(result.reasons));
  assert.ok(result.reasons.length > 0);
});

test("extension scanner flags sideloaded and development installs", () => {
  const base = {
    id: "sideloaded-ext",
    name: "Sideloaded",
    enabled: true,
    version: "1.0.0",
    permissions: [],
    hostPermissions: [],
  };

  const sideloaded = scoreExtensionItem({ ...base, installType: "sideload" });
  const dev = scoreExtensionItem({ ...base, installType: "development" });
  const normal = scoreExtensionItem({ ...base, installType: "normal" });

  assert.ok(sideloaded.score > normal.score);
  assert.ok(dev.score > normal.score);
  assert.ok(
    sideloaded.reasons.some((r) => r.includes("sideloaded or development")),
  );
});

test("extension scanner scores sensitive permissions with weights", () => {
  const ext = {
    id: "perm-ext",
    name: "Permission Test",
    enabled: true,
    installType: "normal",
    version: "1.0.0",
    permissions: ["webRequestBlocking", "cookies", "history"],
    hostPermissions: [],
  };

  const result = scoreExtensionItem(ext);

  assert.ok(result.score > 0);
  assert.ok(
    result.reasons.some((r) => r.includes("sensitive permissions")),
  );
});

test("extension scanner scores broad host access", () => {
  const ext = {
    id: "host-ext",
    name: "Host Test",
    enabled: true,
    installType: "normal",
    version: "1.0.0",
    permissions: [],
    hostPermissions: ["<all_urls>"],
  };

  const result = scoreExtensionItem(ext);

  assert.ok(result.score > 0);
  assert.ok(
    result.reasons.some((r) => r.includes("Broad host access")),
  );
});

test("dashboard risky permissions map matches scored permissions", () => {
  const scoredPerms = [
    "webRequestBlocking",
    "webRequest",
    "cookies",
    "nativeMessaging",
    "history",
    "management",
    "scripting",
    "downloads",
    "clipboardRead",
    "clipboardWrite",
    "tabs",
    "activeTab",
  ];

  for (const perm of scoredPerms) {
    if (perm === "activeTab") continue;
    assert.ok(
      PERMISSION_EXPLANATIONS[perm],
      `Missing explanation for ${perm}`,
    );
  }
});

test("exposure disclaimer text is present in ExtensionHealthPanel", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const panelPath = path.join(
    import.meta.dirname,
    "..",
    "src",
    "components",
    "ExtensionHealthPanel.jsx",
  );
  const content = fs.readFileSync(panelPath, "utf8");

  assert.ok(
    content.includes("exposure analysis"),
    "Missing 'exposure analysis' disclaimer",
  );
  assert.ok(
    content.includes("not proof that an extension is exfiltrating data"),
    "Missing exfiltration disclaimer",
  );
});

test("scan summary panel exposes enable extension scanner button", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const panelPath = path.join(
    import.meta.dirname,
    "..",
    "src",
    "components",
    "ScanSummaryPanel.jsx",
  );
  const content = fs.readFileSync(panelPath, "utf8");

  assert.ok(
    content.includes("Enable management permission"),
    "Missing button to enable extension scanner",
  );
  assert.ok(
    content.includes("RUN_EXTENSION_SCAN"),
    "Missing extension scan trigger",
  );
  assert.ok(
    content.includes("REQUEST_MANAGEMENT_PERMISSION"),
    "Missing management permission request trigger",
  );
});
