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
