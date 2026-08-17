import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("ChatBotPanel component file contains required UI elements", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "components", "ChatBotPanel.jsx");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("Ask the security assistant"), "ChatBotPanel should have a security assistant heading");
  assert.ok(content.includes("Ask"), "ChatBotPanel should have an Ask button");
  assert.ok(content.includes("chatbot-form"), "ChatBotPanel should have a chatbot form");
  assert.ok(content.includes("chatbot-answer"), "ChatBotPanel should have an answer container");
});

test("WeeklyReportPanel renders alerts, top domains, risky downloads, cookie issues, extension risks, and recommendations", async () => {
  const fs = await import("node:fs");
  const path = join(__dirname, "..", "src", "components", "WeeklyReportPanel.jsx");
  const content = fs.readFileSync(path, "utf8");

  assert.ok(content.includes("alerts"), "WeeklyReportPanel should render alerts");
  assert.ok(content.includes("Top risky domains"), "WeeklyReportPanel should render top risky domains");
  assert.ok(content.includes("Risky downloads"), "WeeklyReportPanel should render risky downloads");
  assert.ok(content.includes("Cookie issues"), "WeeklyReportPanel should render cookie issues");
  assert.ok(content.includes("Extension risks"), "WeeklyReportPanel should render extension risks");
  assert.ok(content.includes("Recommended actions"), "WeeklyReportPanel should render recommended actions");
});

test("backendClient exposes fetchChatExplain", async () => {
  const module = await import("../src/lib/backendClient.js");
  assert.ok(typeof module.fetchChatExplain === "function", "fetchChatExplain should be a function");
});
