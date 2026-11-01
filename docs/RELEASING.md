# Releasing

1. Set the version in `package.json`, `package-lock.json` and both manifests:

   ```bash
   make version V=1.5.0
   ```

2. Run everything CI runs, plus the add-on linter and both builds:

   ```bash
   make check
   ```

3. Commit, tag and push:

   ```bash
   git commit -am "Release 1.5.0"
   git tag v1.5.0
   git push origin main v1.5.0
   ```

The tag starts `.github/workflows/release.yml`. It validates, builds both
packages, attaches them to a GitHub release and, when the store credentials are
set as repository secrets, publishes:

- **Chrome Web Store**: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`,
  `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`
- **Firefox Add-ons (AMO)**: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`

Without the secrets the store jobs skip themselves. AMO allows a limited number
of submissions per day; if the AMO job fails on a rate limit, re-run just the
failed job later with `gh run rerun <run-id> --failed`.
