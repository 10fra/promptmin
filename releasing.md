# Releasing

Mirror of `prompt-attest` workflow: tag → GitHub Release, npm publish is manual.

## v1 checklist (suggested)

- Docs: root `README.md` accurate (why + examples).
- CI: `.github/workflows/ci.yml` green on `main`.
- Packaging:
  - `npm test`
  - `npm run pack:smoke -w packages/promptmin-cli`
- Versioning:
  - Update `packages/promptmin-cli/package.json` version
  - Update `CHANGELOG.md`
  - Tag `vX.Y.Z`

## GitHub Release (tagged)

This repo ships `.github/workflows/release.yml`:
- Trigger: push a tag like `v1.0.0`
- Publishes a GitHub Release and attaches:
  - `promptmin-*.tgz` (from `npm pack`)
  - `SHA256SUMS`

Local dry run:

```bash
npm test
npm run pack:smoke -w packages/promptmin-cli
```

## Publish to npm (local)

```bash
npm whoami
npm test
npm run pack:smoke -w packages/promptmin-cli
npm publish -w packages/promptmin-cli --access public
```

Notes:
- Tag/version must match: `v${version}` == `packages/promptmin-cli/package.json` `version`.
- If `npm ci` fails in CI, run `npm install` to re-sync `package-lock.json`, commit, re-tag.
