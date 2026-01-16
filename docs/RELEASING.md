# Releasing

## GitHub Release (now)
- Bump version in `packages/promptmin-cli/package.json`
- Update `CHANGELOG.md`
- Tag + push:
  - `git tag vX.Y.Z`
  - `git push origin vX.Y.Z`
- GitHub Actions creates a Release and uploads:
  - `promptmin-*.tgz` (from `npm pack`)
  - `SHA256SUMS`

## npm (later)
- Bump version in `packages/promptmin-cli/package.json`
- `npm test`
- `npm publish -w packages/promptmin-cli --access public`

## PyPI (later)
- Bump version in `packages/promptmin-py/pyproject.toml`
- `python -m build` (from `packages/promptmin-py/`)
- `twine upload dist/*`
