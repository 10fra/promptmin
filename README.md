# promptmin

Prompt Minimizer: reduce a prompt to the smallest version that still reproduces a failure.

## Quickstart (local demo)

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

## local_command runner contract

When `runner.type = "local_command"`, promptmin runs your command once per test and provides:
- `PROMPT_FILE`: path to a prompt snapshot file (baseline: `baseline.prompt`, candidates: `out/candidates/<sha>.prompt`)
- `PROMPT_TEXT`: full prompt text
- `TEST_JSON`: full test object JSON (includes `id`, `input`, `assert`)
- `TEST_ID`: test id

## Python wrapper (dev)

```bash
PYTHONPATH=packages/promptmin-py python3 -c 'from promptmin import minimize; print(minimize(prompt_path="examples/prompts/support.md", config_path="examples/configs/promptmin.config.json").report_path)'
```
