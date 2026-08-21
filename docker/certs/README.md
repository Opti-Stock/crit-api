# Local Docker CA bundle

Place a local `local-ca.crt` bundle in this directory when Docker builds run
behind a TLS-inspecting proxy or corporate certificate authority.

Generate it on Windows with:

```powershell
.\scripts\export-windows-ca-bundle.ps1
```

The generated `.crt` file is intentionally ignored by git.
