# Releasing

## npm (promptmin)
- Bump version in `packages/promptmin-cli/package.json`
- `npm test`
- `npm publish -w packages/promptmin-cli --access public`

## PyPI (promptmin)
- Bump version in `packages/promptmin-py/pyproject.toml`
- `python -m build` (from `packages/promptmin-py/`)
- `twine upload dist/*`

