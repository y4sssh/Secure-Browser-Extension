import { setupMessageRouter } from "./messageRouter";
import { setupScannerService } from "./scannerService";

setupMessageRouter();
setupScannerService();

// Network monitoring: listen for messages from content scripts to record blocked requests
const BLOCKED_REQUESTS_KEY = "secureBrowser.blockedRequests";

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
				// keep only recent 200 entries
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
