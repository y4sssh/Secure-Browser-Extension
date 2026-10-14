import { setupMessageRouter } from "./messageRouter";
import { setupScannerService } from "./scannerService";

setupMessageRouter();
setupScannerService();

if (typeof chrome?.action?.onClicked?.addListener === "function") {
	chrome.action.onClicked.addListener((tab) => {
		const targetTabId = tab?.id ?? 0;
		const dashboardUrl = chrome.runtime.getURL(
			`dashboard.html${targetTabId ? `?tabId=${targetTabId}&source=toolbar` : "?source=toolbar"}`,
		);

		if (typeof chrome.tabs?.create === "function") {
			chrome.tabs.create({ url: dashboardUrl, active: true }, () => {
				void chrome.runtime.lastError;
			});
		}
	});
}

// Network monitoring: listen for messages from content scripts to record blocked requests
const BLOCKED_REQUESTS_KEY = "secureBrowser.blockedRequests";

if (typeof chrome?.runtime?.onMessage?.addListener === "function") {
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		try {
			if (message?.type === "secureBrowser.logBlockedRequest" && message?.payload) {
				const entry = {
					id: Date.now() + Math.random().toString(36).slice(2, 9),
					url: message.payload.url || "",
					method: message.payload.method || "GET",
					reason: message.payload.reason || "blocked by rule",
					time: new Date().toISOString(),
					tabId: sender.tab?.id ?? null,
				};
				chrome.storage.local.get({ [BLOCKED_REQUESTS_KEY]: [] }, (items) => {
					const list = items[BLOCKED_REQUESTS_KEY] || [];
					list.unshift(entry);
					const next = list.slice(0, 200);
					chrome.storage.local.set({ [BLOCKED_REQUESTS_KEY]: next });
				});
				sendResponse({ ok: true });
				return true;
			}
		} catch (e) {
			// ignore
		}
		return false;
	});
}
