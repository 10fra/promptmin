# Product List

Promptmin: prompt minimizer (ddmin) + artifacts, for turning “this prompt fails” into a tiny repro.

## Shipping (v1.0 candidate)

- CLI: `promptmin minimize` (Node)
  - ddmin + greedy strategies
  - granularity: `sections|blocks|sentences|lines`
  - target selectors: `test:<id>` / `suite:any` / `suite:all`
  - budgets: `--budget-runs`, `--max-minutes`
  - caching: `--cache on|off`, `--cache-dir`
  - stability: `--stability-mode off|strict|kofn` + `--stability-n`, `--stability-k`
  - safety: `--no-trace-output` (no `trace.jsonl`, no candidate snapshots)
  - output: `report.md`, `meta.json`, `diff.patch`, `baseline.prompt`, `minimized.prompt`
  - exit codes: `0|2|3|4`

- Prompt structure support
  - Markdown headings/blocks/lists/fences chunking
  - YAML-ish role blocks (`system:` / `developer:` / `user:`)
  - preserve: keep tags (`<!-- promptmin:keep -->`, `# keep`) + config selectors (`heading|regex|tag`)

- Runners
  - `local_command`
  - `openai_responses` (Responses API)

- Assertions
  - `contains`, `not_contains`, `regex_match`, `regex_not_match`, `json_schema`

- Python wrapper (dev)
  - `promptmin.minimize(...)` shells out to `promptmin` or repo `dist/cli.js`

## Release 1.0 checklist (GitHub Release only)

- CI green on `main` (`.github/workflows/ci.yml`)
- `CHANGELOG.md` has real entries under “Unreleased”
- Tag matches CLI package version (`packages/promptmin-cli/package.json`)
- Push tag `vX.Y.Z` → GitHub Actions creates Release + uploads `*.tgz` + `SHA256SUMS`
- README(s) accurate:
  - root `README.md` (project)
  - `packages/promptmin-cli/README.md` (npm tarball readme)

## Not shipping yet (explicitly deferred)

- npm publish
- PyPI publish

## Next up (post-1.0)

- Make `packages/promptmin-cli/README.md` match root README (install + examples)
- Add `--seed` (deterministic ordering) + document determinism limits
- Add token estimate + optional `tokens` granularity (PRD mentions it)
- Provider runners:
  - Anthropic Messages
  - OpenAI Chat Completions (if needed alongside Responses)
- Report accuracy polish
  - distinguish “budget/time best-effort” vs “confirm-final did not reproduce”
  - include stability config in `meta.json`
  - see `docs/ROADMAP.md` for full list
