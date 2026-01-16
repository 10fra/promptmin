# Roadmap (Missing Features)

This is the “what’s missing” list to get from v1.0 → “daily-driver” + broader adoption.

## Release-quality polish

- Make exit codes exhaustive + documented everywhere (CLI help, README, report, meta).
- Tighten report semantics:
  - exit `3` can mean “budget best-effort” or “confirm-final didn’t reproduce” (make explicit sections).
  - include stability config + cache stats in `meta.json`.
- Add a `--dry-run` mode (print plan, config parse, prompt chunk stats; no evals).
- Add `--version` and a stable `promptmin --help` synopsis.

## Determinism + performance

- Add `--seed` for deterministic candidate ordering (ddmin splitting + greedy).
- Token estimation (cheap heuristic) in `report.md` + `meta.json`.
- Optional `--budget-tokens` (soft cap) if token estimator exists.
- Faster chunking for huge prompts; guardrails for “too many chunks”.

## Minimization improvements

- Add `tokens` granularity (PRD mentioned; requires tokenizer or heuristic).
- Hierarchical minimization defaults:
  - `sections → blocks → sentences → lines` auto-descent (configurable).
- Better monotonicity handling:
  - keep “best failing” candidate even when failure is non-monotonic.
  - optional “shrink within chunk” pass (split large preserved blocks).
- Preserve selectors expansion:
  - support “range” preserve (`start_tag`/`end_tag`) for keep-regions.
  - add `type: path` for structured prompts (JSON/YAML pointers).

## Runner surface area

- Add `anthropic_messages` runner.
- Add OpenAI Chat Completions runner (if needed alongside Responses).
- Add generic `http_json` runner (POST endpoint, map request/response via templates).
- Better secret hygiene:
  - redact in `report.md` + `meta.json`, not only runner errors.
  - `--redact off|on` toggle.

## Test model + assertions

- Add “custom predicate” asserts (JS module path) for advanced workflows.
- Add structured assertion outputs:
  - include “why failed” detail (regex mismatch, schema path, etc) in `meta.json`.
- Add suite selection helpers:
  - `--target-file tests.json` or `--only <glob>` (optional).

## Packaging + distribution

- npm publish automation (optional):
  - “tag push” could also publish to npm if credentials present.
  - keep provenance: attach `SHA256SUMS` + (optional) SBOM.
- Python wrapper clarity:
  - decide: bundle Node vs require Node; document and enforce.
  - add more wrapper tests (exec path discovery, error surfacing).

## Docs + examples

- Expand `examples/`:
  - a JSON schema fixture
  - an OpenAI Responses fixture (with mock server)
  - a flaky runner demo showing `kofn` vs `strict`
- “How to write a runner” guide:
  - env var contract
  - recommended logging + timeouts
  - cache key considerations

