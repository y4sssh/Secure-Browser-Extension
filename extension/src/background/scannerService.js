import {
  scoreDownloadItem,
  scoreCookieItem,
  scoreExtensionItem,
} from "../lib/securityUtils";
import {
  getLatestCookieScans,
  getLatestExtensionScans,
  getLatestPasswordScans,
  getLatestDownloadScans,
  saveCookieScan,
  saveExtensionScan,
  savePasswordScan,
  saveDownloadScan,
  findPasswordFingerprint,
} from "../lib/storage/scanStorage";

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getCookieExpiryDays(cookie) {
  if (!cookie.expirationDate) return 0;
  return Math.max(0, Math.round((cookie.expirationDate - Date.now() / 1000) / 86400));
}

function queryActiveTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve(null);
        return;
      }
      resolve(tabs?.[0]?.url ?? null);
    });
  });
}

function getDownloadById(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve(null);
        return;
      }
      resolve(items?.[0] ?? null);
    });
  });
}

async function runDownloadScanForItem(downloadItem) {
  if (!downloadItem) return null;
  const result = scoreDownloadItem(downloadItem);
  const scan = {
    id: `download-${downloadItem.id}`,
    timestamp: new Date().toISOString(),
    url: downloadItem.url || "",
    filename: downloadItem.filename || "",
    danger: downloadItem.danger || "unknown",
    risk: result.score,
    reasons: result.reasons,
  };
  await saveDownloadScan(scan);
  return scan;
}

export function setupScannerService() {
  if (chrome?.downloads?.onCreated) {
    chrome.downloads.onCreated.addListener(runDownloadScanForItem);
  }

  if (chrome?.downloads?.onChanged) {
    chrome.downloads.onChanged.addListener(async (delta) => {
      if (!delta?.id) return;
      const downloadItem = await getDownloadById(delta.id);
      await runDownloadScanForItem(downloadItem);
    });
  }
}

export async function runCookieScan() {
  const activeUrl = await queryActiveTabUrl();
  if (!activeUrl || !chrome.cookies) {
    throw new Error("Cookie scan unavailable");
  }

  const cookieUrl = activeUrl;
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll({ url: cookieUrl }, async (cookies) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      const scan = {
        timestamp: new Date().toISOString(),
        origin: cookieUrl,
        domain: getDomainFromUrl(cookieUrl),
        cookieCount: cookies.length,
        risk: 0,
        reasons: [],
        cookies: [],
      };

      for (const cookie of cookies) {
        const item = {
          nameHash: await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(`secure-browser-cookie|${cookie.name}`),
          ).then((buffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("")),
          domain: cookie.domain || "",
          secure: Boolean(cookie.secure),
          httpOnly: Boolean(cookie.httpOnly),
          sameSite: cookie.sameSite || "no_restriction",
          expiryDays: getCookieExpiryDays(cookie),
        };
        const score = scoreCookieItem(item);
        scan.risk = Math.max(scan.risk, score.score);
        scan.reasons.push(...score.reasons);
        scan.cookies.push(item);
      }

      scan.reasons = Array.from(new Set(scan.reasons)).slice(0, 8);
      await saveCookieScan(scan);
      resolve(scan);
    });
  });
}

export async function runExtensionScan() {
  if (!chrome.management || !chrome.management.getAll) {
    throw new Error("Extension scanner unavailable");
  }

  return new Promise((resolve, reject) => {
    chrome.management.getAll(async (extensions) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      const filtered = extensions.filter((item) => item.id !== chrome.runtime.id);
      const scans = filtered.map((extension) => {
        const result = scoreExtensionItem(extension);
        return {
          id: extension.id,
          name: extension.name,
          enabled: Boolean(extension.enabled),
          installType: extension.installType || "unknown",
          permissions: extension.permissions ?? [],
          hostPermissions: extension.hostPermissions ?? [],
          risk: result.score,
          reasons: result.reasons,
        };
      });

      const combinedRisk = scans.reduce((maxRisk, item) => Math.max(maxRisk, item.risk), 0);
      const scan = {
        timestamp: new Date().toISOString(),
        extensionCount: scans.length,
        risk: combinedRisk,
        reasons: scans.flatMap((item) => item.reasons).slice(0, 8),
        extensions: scans,
      };
      await saveExtensionScan(scan);
      resolve(scan);
    });
  });
}

export async function handlePasswordAnalysis(payload) {
  if (!payload || !payload.hash) {
    throw new Error("Invalid password analysis payload");
  }

  const existing = await findPasswordFingerprint(payload.hash);
  const reuseDetected = Boolean(existing && existing.domain !== payload.domain);
  const reuseCount = existing ? existing.reuseCount + 1 : 1;
  const scan = {
    timestamp: new Date().toISOString(),
    pageUrl: payload.pageUrl || "",
    domain: payload.domain || "",
    strength: payload.strength ?? 0,
    hash: payload.hash,
    reuseDetected,
    reuseCount,
  };

  await savePasswordScan(scan);
  return scan;
}

export async function requestCookiePermission() {
  return new Promise((resolve) => {
    chrome.permissions.request({ permissions: ["cookies"] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

export async function requestManagementPermission() {
  return new Promise((resolve) => {
    chrome.permissions.request({ permissions: ["management"] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}
