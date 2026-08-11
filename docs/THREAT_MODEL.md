# Threat Model

## Protected Assets

- Browser credentials and passwords
- Form submission destinations and credential flows
- Suspicious downloads and file metadata
- Installed extension exposure and over-permissioned extensions
- Page trust signals and evidence-based alerts

## Adversaries

- Phishing pages that impersonate legitimate brands
- Credential harvesters using cross-origin or insecure forms
- Malicious download hosts sending risky files
- Over-privileged extensions exposing user browsing state
- Visual spoofing and brand impersonation attacks

## Attack Surfaces

- Web page DOM content and login forms
- Page URLs, redirects, query strings, and hostnames
- Iframes and embedded login content
- Extension messaging and local storage
- Optional cloud analysis and backend APIs

## Trust Boundaries

- Page content is untrusted; only metadata and structural signals are analyzed.
- Content scripts inspect page structure and form metadata, but do not read raw typed password values.
- The MV3 service worker maintains stored evidence and coordinates scan messages.
- The backend receives sanitized evidence and performs reputation analysis; it does not receive raw passwords, cookie values, or unredacted page bodies.
- Third-party feeds and APIs are optional and only used with explicit consent.

## What the System Does Not Protect

- It does not guarantee protection against all phishing or malware.
- It does not inspect raw browser network traffic beyond the page URL and navigation.
- It does not collect or store raw password, cookie, or file contents.
- It does not prove runtime data theft by other extensions.

## Assumptions

- User consent is required for optional analysis features (cloud text analysis, cookie access, extension scanning).
- The extension can analyze DOM structure and form metadata locally.
- Backend services operate as a trusted component for aggregated reputation and optional model inference.
