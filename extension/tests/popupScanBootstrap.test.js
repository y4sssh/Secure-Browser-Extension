import assert from "node:assert/strict";
import { test } from "node:test";

import { ensureLatestPageScan } from "../src/popup/scanBootstrap.js";
import { MESSAGE_TYPES } from "../src/lib/chrome/messageTypes.js";
import { sendTabMessage } from "../src/lib/chrome/runtime.js";
import { setupScannerService } from "../src/background/scannerService.js";

test("ensureLatestPageScan requests a page scan when no evidence is stored yet", async () => {
  const calls = [];
  let readCount = 0;

  const evidence = {
    tabId: 42,
    url: "https://example.com/login",
    verdict: "risky",
    reasons: ["Fake login form detected"],
  };

  const result = await ensureLatestPageScan({
    readLatestEvidence: async () => {
      readCount += 1;
      if (readCount === 1) {
        return null;
      }
      return evidence;
    },
    queryActiveTab: async () => ({ id: 42, url: "https://example.com/login" }),
    sendTabMessage: async (tabId, message) => {
      calls.push({ tabId, message });
      return { ok: true };
    },
    waitMs: 0,
    setStatus: () => {},
  });

  assert.deepEqual(result, { evidence, error: "" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tabId, 42);
  assert.equal(calls[0].message.type, MESSAGE_TYPES.REQUEST_PAGE_SCAN);
});

test("ensureLatestPageScan skips unsupported tab URLs before sending a connection request", async () => {
  const calls = [];

  const result = await ensureLatestPageScan({
    readLatestEvidence: async () => null,
    queryActiveTab: async () => ({ id: 42, url: "chrome://newtab/" }),
    sendTabMessage: async (tabId, message) => {
      calls.push({ tabId, message });
      return { ok: true };
    },
    waitMs: 0,
    setStatus: () => {},
  });

  assert.deepEqual(result, {
    evidence: null,
    error: "This page does not support live scanning.",
  });
  assert.equal(calls.length, 0);
});

test("ensureLatestPageScan never shows evidence from another tab", async () => {
  const calls = [];
  const staleEvidence = {
    tabId: 7,
    url: "https://phishing.example/login",
    verdict: "risky",
  };
  const activeEvidence = {
    tabId: 42,
    url: "https://www.instagram.com/",
    verdict: "trusted",
  };
  let reads = 0;

  const result = await ensureLatestPageScan({
    readLatestEvidence: async () => {
      reads += 1;
      return reads === 1 ? staleEvidence : activeEvidence;
    },
    queryActiveTab: async () => ({ id: 42, url: "https://www.instagram.com/?locale=en" }),
    sendTabMessage: async (tabId, message) => {
      calls.push({ tabId, message });
      return { ok: true };
    },
    waitMs: 0,
  });

  assert.deepEqual(result, { evidence: activeEvidence, error: "" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tabId, 42);
});

test("sendTabMessage injects the content script and retries when an existing tab has no receiver", async () => {
  const previousChrome = globalThis.chrome;
  const sentMessages = [];
  const injectedFiles = [];
  let sendAttempts = 0;

  globalThis.chrome = {
    runtime: { id: "extension-id", lastError: undefined },
    tabs: {
      get: (_tabId, callback) => callback({ url: "https://example.com/login" }),
      sendMessage: (_tabId, message, callback) => {
        sentMessages.push(message);
        sendAttempts += 1;
        if (sendAttempts === 1) {
          globalThis.chrome.runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
          callback();
          globalThis.chrome.runtime.lastError = undefined;
          return;
        }

        callback({ ok: true });
      },
    },
    scripting: {
      executeScript: (details, callback) => {
        injectedFiles.push(details.files);
        globalThis.chrome.runtime.lastError = undefined;
        callback();
      },
    },
  };

  try {
    const result = await sendTabMessage(42, { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN });
    assert.deepEqual(result, { ok: true });
    assert.equal(sendAttempts, 2);
    assert.deepEqual(injectedFiles, [["assets/contentScript.js"]]);
    assert.deepEqual(sentMessages, [
      { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN },
      { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN },
    ]);
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("setupScannerService ignores Chrome event objects whose addListener is not callable", () => {
  const calls = [];
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    downloads: {
      onCreated: { addListener: "not-a-function" },
      onChanged: { addListener: "also-not-a-function" },
    },
    runtime: { lastError: undefined },
  };

  try {
    assert.doesNotThrow(() => setupScannerService());
    assert.deepEqual(calls, []);
  } finally {
    globalThis.chrome = previousChrome;
  }
});
