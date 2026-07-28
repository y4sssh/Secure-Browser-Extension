# Secure-Browser-Extension
Unlike traditional browser extensions that inspect only URLs, the extension continuously observes browser events exposed by browser APIs (with user permission). It does not read private content unnecessarily; instead it analyzes security-relevant events and page behaviour to detect malicious patterns.

## Phase 1 Extension Scaffold

The `extension/` directory contains a Chrome Manifest V3 scaffold with:

- React popup UI.
- React dashboard page.
- MV3 service worker.
- Content script evidence collection.
- Chrome storage wrapper for recent page evidence.
- Message passing between content script, service worker, popup, and dashboard.

### Build and Load

```bash
cd extension
npm install
npm run build
```

Then load `extension/dist` in Chrome using `chrome://extensions` with Developer mode enabled.
