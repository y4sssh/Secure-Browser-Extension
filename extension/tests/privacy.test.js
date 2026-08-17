import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("passwordAnalyzer does not send raw password values", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "content", "passwordAnalyzer.js");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(!content.includes("value: input.value"), "Raw password value should not be sent");
  assert.ok(content.includes("hash: sha256"), "Only hashed password should be sent");
  assert.ok(content.includes("sha1Hex(value)"), "SHA-1 is used only for HIBP k-anonymity");
});

test("scannerService does not store or send cookie values", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "background", "scannerService.js");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(!content.includes("cookie.value"), "Cookie value should never be accessed");
  assert.ok(content.includes("nameHash"), "Only cookie name hash should be stored");
});

test("download scan does not read or upload file bytes", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "background", "scannerService.js");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(!content.includes("FileReader"), "No FileReader for download files");
  assert.ok(!content.includes("readAsArrayBuffer"), "No array buffer reads for downloads");
  assert.ok(!content.includes("upload"), "No upload logic for downloads");
});

test("manifest.json declares optional permissions for cookies and management", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "manifest.json");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes('"optional_permissions"'), "optional_permissions should be declared");
  assert.ok(content.includes('"cookies"'), "cookies should be optional");
  assert.ok(content.includes('"management"'), "management should be optional");
});

test("manifest.json includes explicit content security policy", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "manifest.json");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("content_security_policy"), "CSP should be declared");
  assert.ok(content.includes("script-src 'self'"), "CSP should restrict script sources");
  assert.ok(content.includes("object-src 'none'"), "CSP should block plugins");
});

test("ScanSummaryPanel explains permission usage", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "components", "ScanSummaryPanel.jsx");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("Cookie values are never stored"), "Cookie permission should explain no value storage");
  assert.ok(content.includes("No extension data is sent externally"), "Management permission should explain data handling");
  assert.ok(content.includes("Scans run locally"), "Panel should state local-only scanning");
});

test("PrivacyNotice component documents all privacy rules", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "components", "PrivacyNotice.jsx");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("Raw passwords are never stored"), "Should mention raw password rule");
  assert.ok(content.includes("Cookie values are never stored"), "Should mention cookie value rule");
  assert.ok(content.includes("Downloaded files are never uploaded"), "Should mention no auto-upload rule");
  assert.ok(content.includes("VirusTotal lookups"), "Should mention backend-only VirusTotal");
  assert.ok(content.includes("Cloud AI"), "Should mention cloud AI consent");
  assert.ok(content.includes("optional permission"), "Should mention optional permissions");
});

test("ConsentPanel component exists with required consents", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "components", "ConsentPanel.jsx");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("cloudAiConsent"), "Should have cloud AI consent toggle");
  assert.ok(content.includes("hibpConsent"), "Should have HIBP consent toggle");
  assert.ok(content.includes("secureBrowser.consents"), "Should persist consents to storage");
});

test("chat explain endpoint does not accept raw passwords or cookies", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "lib", "backendClient.js");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(!content.includes("password"), "backendClient should not reference password fields");
  assert.ok(!content.includes("cookie"), "backendClient should not reference cookie fields");
});

test("pageScanner sanitizes text snippets before storage", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "content", "pageScanner.js");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("sanitizeTextSnippet"), "pageScanner should sanitize text");
  assert.ok(content.includes("[email]"), "Sanitization should redact emails");
  assert.ok(content.includes("[token]"), "Sanitization should redact tokens");
});

test("evidence schema limits stored evidence size", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "lib", "evidence", "schema.js");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("MAX_REASONS_PER_EVIDENCE"), "Should cap reasons per evidence");
  assert.ok(content.includes("MAX_TEXT_SNIPPETS"), "Should cap text snippets");
});

test("extension has no remote code imports or eval", async () => {
  const fs = await import("node:fs");
  const manifestPath = join(__dirname, "..", "manifest.json");
  const manifest = fs.readFileSync(manifestPath, "utf8");

  const srcDir = join(__dirname, "..", "src");
  const srcFiles = fs.readdirSync(srcDir, { withFileTypes: true, recursive: true });

  for (const file of srcFiles) {
    if (!file.name.endsWith(".js") && !file.name.endsWith(".jsx")) continue;
    const fullPath = join(file.parentPath, file.name);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(!content.includes("eval("), `eval( found in ${fullPath}`);
    assert.ok(!content.includes("new Function("), `new Function( found in ${fullPath}`);
    assert.ok(!content.includes("import("), `dynamic import( found in ${fullPath}`);
  }
});
