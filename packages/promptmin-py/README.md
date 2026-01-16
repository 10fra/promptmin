# promptmin

[![PyPI version](https://img.shields.io/pypi/v/promptmin)](https://pypi.org/project/promptmin/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Prompt minimizer for LLM evals** — shrink a prompt to the smallest input that still reproduces a failure using delta debugging (ddmin).

## Why?

- **Fast debugging**: minimal repros beat 300-line prompts
- **Cheaper CI**: fewer tokens, fewer moving parts
- **Safer iteration**: smaller diffs, clearer "what changed"
- **Handles flakiness**: stability modes (`strict` / `k-of-n`) and `--confirm-final`

## Installation

This package is a Python wrapper that shells out to the `promptmin` Node CLI.

```bash
# 1. Install the CLI
npm install -g promptmin

# 2. Install the Python wrapper
pip install promptmin
```

## Usage

### Python API

```python
from promptmin import minimize

result = minimize(
    prompt_path="prompts/support.md",
    config_path="promptmin.config.json",
    target="test:refund_policy_01",
    budget_runs=60
)

print(f"Minimized: {result.minimized_path}")
print(f"Report: {result.report_path}")
```

### CLI

```bash
promptmin-py minimize \
  --prompt prompts/support.md \
  --config promptmin.config.json \
  --target test:refund_policy_01 \
  --budget-runs 60
```

## Config example

```json
{
  "runner": {
    "type": "openai_responses",
    "model": "gpt-4.1-mini"
  },
  "tests": [{
    "id": "refund_policy_01",
    "input": { "user": "Can I get a refund?" },
    "assert": { "type": "regex_not_match", "pattern": "competitor" }
  }]
}
```

Requires `OPENAI_API_KEY` for the `openai_responses` runner, or use `local_command` to run your own eval script.

## Artifacts

After minimization, you get:
- `baseline.prompt` / `minimized.prompt` — before and after
- `diff.patch` — what was removed
- `report.md` / `meta.json` — summary and metadata

## Options

| Flag | Description |
|------|-------------|
| `--strategy` | `ddmin` (default) or `greedy` |
| `--granularity` | `sections`, `blocks`, `sentences`, or `lines` |
| `--stability-mode` | `strict` or `kofn` for flaky tests |
| `--confirm-final` | Re-verify the final minimized prompt |
| `--no-trace-output` | Disable trace logging (for sensitive prompts) |

## Links

- [GitHub](https://github.com/10fra/promptmin)
- [Full documentation](https://github.com/10fra/promptmin#readme)

## License

MIT
