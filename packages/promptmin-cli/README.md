# 🧹 promptmin

Prompt minimizer for LLM evals: shrink a prompt to the smallest input that still reproduces a failure (delta debugging / ddmin).

## Install (GitHub Release tarball)

Download `promptmin-*.tgz` from the Release, then:

```bash
npm install -g ./promptmin-*.tgz
promptmin --help
```

## Why is this useful?

- Fast debugging: minimal repros beat 300-line prompts.
- Cheaper/faster CI: fewer tokens + fewer moving parts.
- Safer iteration: smaller diffs + clearer “what changed”.
- Handles flakiness: stability modes (`strict` / `k-of-n`) and `--confirm-final`.

## Quickstart (from source)

```bash
npm install
npm run build
node packages/promptmin-cli/dist/cli.js minimize \
  --prompt examples/prompts/support.md \
  --config examples/configs/promptmin.config.json \
  --out .promptmin/out \
  --target test:refund_policy_01 \
  --budget-runs 60
```

Artifacts land in `.promptmin/out/`.

## Artifacts + exit codes

Artifacts:
- `baseline.prompt`, `minimized.prompt`
- `diff.patch`
- `report.md`, `meta.json`
- `trace.jsonl` (unless `--no-trace-output`)

Exit codes:
- `0`: minimized prompt still fails (success)
- `2`: baseline prompt did not fail
- `3`: best-effort result (budget exceeded and/or `--confirm-final` did not reproduce)
- `4`: runner/config error

## Config (runners + tests)

### `local_command`

`examples/configs/promptmin.config.json`:

```json
{
  "runner": { "type": "local_command", "command": ["bash", "-lc", "python3 examples/runners/run_eval.py"] },
  "tests": [{ "id": "refund_policy_01", "input": { "user": "..." }, "assert": { "type": "regex_not_match", "pattern": "..." } }]
}
```

Runner contract: promptmin runs your command once per test/trial and provides:
- `PROMPT_FILE`: path to a prompt snapshot file (baseline: `baseline.prompt`, candidates: `out/candidates/<sha>.prompt`)
- `PROMPT_TEXT`: full prompt text
- `TEST_JSON`: full test object JSON (includes `id`, `input`, `assert`)
- `TEST_ID`: test id
- `PROMPTMIN_TRIAL_INDEX`, `PROMPTMIN_TRIAL_COUNT`: stability retry metadata

### `openai_responses`

```json
{
  "runner": { "type": "openai_responses", "model": "gpt-4.1-mini", "max_retries": 2 },
  "tests": [{ "id": "refund_policy_01", "input": { "user": "..." }, "assert": { "type": "regex_not_match", "pattern": "..." } }]
}
```

Prompt format: optional YAML-ish role blocks (`system:`, `developer:`, `user:`). promptmin appends `tests[].input.user` (or JSON) as the final user message.

Requires `OPENAI_API_KEY` (or set `runner.api_key_env`).

Example prompt:

```text
system: |
  You are a helpful support agent.
developer: |
  Follow the company refund policy.
```

## Controlling minimization

- Strategy: `--strategy ddmin` (default) or `--strategy greedy`
- Granularity: `--granularity sections|blocks|sentences|lines`
- Flakiness: `--stability-mode strict --stability-n 3` or `--stability-mode kofn --stability-n 5 --stability-k 3`
- Final verification: `--confirm-final`
- Sensitive environments: `--no-trace-output` (disables `trace.jsonl` + candidate snapshots)
- Target selector: `--target test:<id>` (or `suite:any` / `suite:all`)

## Preserving prompt parts

Keep tag inside any chunk to prevent deletion:
- `<!-- promptmin:keep -->`
- `# keep`

Or configure preserve selectors:

```json
{ "prompt": { "preserve": [{ "type": "heading", "value": "Safety policy" }, { "type": "regex", "pattern": "DO NOT REMOVE" }] } }
```
