# Secure Browser Extension Test Sites

Serve this directory from a local HTTP server and load the built extension from
`extension/dist`.

```sh
python3 -m http.server 8080 -d test-sites
```

- `phishing-cross-domain/` contains a Microsoft-themed password form that posts
  to a different registrable domain.
- `injected-form/` injects a credential overlay after page load so FormGuard can
  record a delayed login mutation.
- `iframe-login/` embeds an accessible iframe containing a password form.
- `http-password/` asks for a password from an HTTP page.
- `action-change/` rewrites a credential form action after page load.
- `brandguard-microsoft/`, `brandguard-google/`, and `brandguard-paypal/`
  contain fake branded login pages hosted away from the brand's expected
  domains for Phase 6 mismatch checks.
