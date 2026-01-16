# PRD: Prompt Minimizer (Node CLI + Python Wrapper)

## Summary
Prompt Minimizer is a developer tool that **reduces a prompt to the smallest version that still reproduces a failure**. Given:
- a prompt (text, possibly structured into sections)
- a test suite (one or more testcases)
- a pass/fail predicate

…it runs a delta-debugging-style minimization loop to produce:
- `minimized.prompt` (smallest failing prompt)
- `report.md` (what changed, why it still fails, how stable the failure is)
- optional diffs and artifacts to use in PRs/issues

The primary target use case is: *“I have a flaky / complex prompt and I need a minimal repro to fix it, share it, or add a regression test.”*

---

## Goals
1. **Produce minimal failing prompts** reliably and repeatably.
2. **Be usable from CI** (deterministic outputs, caching, exit codes, artifacts).
3. **Be prompt-structure-aware** enough to yield human-readable results (remove sections/bullets before slicing words).
4. **Handle nondeterminism** with configurable stability checks (N runs, k-of-N).
5. Ship as a **Node.js CLI** with a thin **Python wrapper** for Python-centric workflows.

## Non-goals (initially)
- No MCP integrations.
- No hosted UI / web dashboard.
- No full evaluation framework (we run tests; we don’t design evals).
- No automatic “fix the prompt” generation (only minimize + report).
- No proprietary provider lock-in (support multiple providers or external runner).

---

## Users & Personas
### Prompt Engineer / Product Engineer
- Has a prompt in a repo (Markdown/YAML) and wants a minimal failing repro to debug.
### ML/AI Engineer
- Wants to reduce failures in structured output prompts (JSON schema), add regression tests.
### OSS Maintainer
- Needs minimal reproduction prompts for GitHub issues and PR review.

---

## Primary User Stories
1. **Minimize a failing prompt against a single test**
   - “Given prompt X and test Y fails, find the smallest prompt that still fails.”
2. **Minimize against a suite**
   - “Keep failing on at least one test (or a selected test).”
3. **Minimize under nondeterminism**
   - “The failure happens 40% of the time; minimize while preserving probability.”
4. **Produce shareable artifacts**
   - “Generate a report and diff I can attach to an issue/PR.”

---

## UX: CLI Interface

### Command: `promptmin minimize`
Minimize a prompt using a config file.

**Example**
```bash
promptmin minimize \
  --prompt prompts/support.md \
  --config promptmin.config.json \
  --out .promptmin/out \
  --target test:refund_policy_01
```

**Flags**
- `--prompt <path>`: prompt file path (required)
- `--config <path>`: config path (required)
- `--out <dir>`: output directory (default: `.promptmin/out`)
- `--target <selector>`: which tests define “failure”
  - `test:<id>` = minimize to preserve failure on that test
  - `suite:any` = failure if any test fails (default)
  - `suite:all` = failure if all tests fail (rare; supported)
- `--budget-runs <int>`: hard cap on total evaluations (default: 200)
- `--max-minutes <int>`: time limit (default: 20)
- `--strategy <ddmin|greedy>`: algorithm (default: `ddmin`)
- `--granularity <sections|blocks|lines|sentences|tokens>`: lowest unit allowed (default: `sentences`)
- `--stability-mode <strict|kofn|off>`:
  - `strict`: candidate must fail on all repeats
  - `kofn`: candidate fails if >=k of n runs fail
  - `off`: single run only (fast, not robust)
- `--stability-n <int>` and `--stability-k <int>` (defaults: n=3, k=2; only for `kofn`)
- `--seed <int>`: deterministic ordering (default: 1337)
- `--cache <on|off>`: disk cache (default: on)
- `--verbose`: print evaluation trace
- `--json`: also emit `report.json`
- `--confirm-final`: rerun minimized prompt with higher stability (default: on)

**Exit codes**
- `0`: minimized successfully; minimized prompt still fails per target definition
- `2`: prompt did not fail at baseline (nothing to minimize)
- `3`: could not find any reduced prompt within budget that preserves failure (returns best-so-far)
- `4`: config/test runner error
- `5`: provider/runtime error

---

## Inputs

### Prompt input formats (v1)
- Plain text
- Markdown with headings/bullets
- YAML-ish “role blocks” (best-effort parse):
  - `system: |`
  - `developer: |`
  - `user: |`

We do **not** require a strict schema; we provide robust heuristics + “fallback to plain text”.

### Config file: `promptmin.config.json` (v1)
```json
{
  "runner": {
    "type": "openai_chat_completions",
    "model": "gpt-4.1-mini",
    "temperature": 0,
    "max_output_tokens": 800,
    "timeout_ms": 60000
  },
  "prompt": {
    "format": "markdown",
    "preserve": [
      { "type": "heading", "value": "Safety" },
      { "type": "tag", "value": "keep" }
    ]
  },
  "tests": [
    {
      "id": "refund_policy_01",
      "input": {
        "user": "I bought this 45 days ago. Can I get a refund?"
      },
      "assert": {
        "type": "regex_not_match",
        "pattern": "Yes,.*refund"
      }
    },
    {
      "id": "format_json_01",
      "input": {
        "user": "Extract fields from: Alice, alice@example.com"
      },
      "assert": {
        "type": "json_schema",
        "schema": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "email": { "type": "string" }
          },
          "required": ["name", "email"]
        }
      }
    }
  ]
}
```

### Runner types (v1)
A) **Built-in providers**
- `openai_chat_completions`
- `anthropic_messages` (if keys present)
- `local_command` (universal escape hatch; recommended for CI and mocks)

B) **Local command runner** (MVP-critical)
- `runner.type = "local_command"`
- `runner.command = ["bash", "-lc", "python run_eval.py --prompt $PROMPT --test $TEST_JSON"]`
- Environment variables provided:
  - `PROMPT_FILE`
  - `PROMPT_TEXT`
  - `TEST_JSON`
  - `TEST_ID`

This ensures the minimizer works even without direct provider integrations.

---

## Outputs (Artifacts)

### Required output files
In `--out` directory:
- `minimized.prompt` — minimized prompt text
- `baseline.prompt` — original prompt snapshot used for run
- `report.md` — human-readable report
- `meta.json` — run metadata (versions, seed, config hash, model params)
- `trace.jsonl` — evaluation log (each candidate: hash, removed chunks, pass/fail, timings)
- `diff.patch` — unified diff from baseline → minimized

### `report.md` must include
- Baseline status (failed? which tests? stability stats)
- Minimization objective (`target`)
- Final minimized status (failed? stability stats)
- Size reduction:
  - chars, lines, estimated tokens (rough estimator)
- Removed chunk summary:
  - top-level headings removed
  - number of bullets removed
  - examples removed
- Reproduction instructions:
  - exact CLI command
  - exact config + prompt hashes
- “Best candidate if not fully preserved” section (if exit code 3)

---

## Core Feature Requirements (Specific)

## 1) Baseline evaluation
**Description**
- Before minimizing, evaluate the baseline prompt against selected target.
- If baseline does not fail per target definition: exit code `2` and produce report.

**Acceptance criteria**
- Baseline evaluation result is logged in `trace.jsonl`.
- Report states baseline failure status and stability stats (if enabled).

---

## 2) Prompt chunking (structure-aware)
**Chunk hierarchy (v1)**
1. Sections:
   - Markdown headings (`#`, `##`, `###`)
   - YAML role blocks (system/developer/user)
2. Blocks within sections:
   - bullet groups (list items)
   - code fences
   - paragraphs separated by blank lines
3. Lines / sentences:
   - sentence splitting (simple heuristic; no NLP dependency)
   - line-based fallback

**Rules**
- Always keep original ordering.
- Preserve formatting (headings remain headings; bullet indentation preserved).
- Allow `preserve` selectors (do not remove):
  - heading name match
  - tagged lines (e.g., `<!-- promptmin:keep -->` or `# keep`)
  - regex match patterns

**Acceptance criteria**
- Given a prompt with headings/bullets, the minimized prompt remains well-formed Markdown.
- Preserve selectors are honored (never removed).

---

## 3) Minimization algorithms
### 3.1 ddmin (default)
- Perform delta debugging on chunk lists:
  - start at highest level (sections), then descend levels if needed
- Try removing subsets at increasing granularity
- Keep the best failing candidate

### 3.2 Greedy (optional)
- Try removing chunks one-by-one in a stable order
- Faster, potentially less minimal

**Acceptance criteria**
- ddmin reduces at least as well as greedy on provided fixtures.
- Algorithm is deterministic given `--seed` and stable evaluation outcomes.

---

## 4) Failure definition & test selection
**Target modes**
- `test:<id>`: failing if that test fails
- `suite:any`: failing if any test fails (default)
- `suite:all`: failing if all tests fail

**Assertions supported (v1)**
- `contains` / `not_contains`
- `regex_match` / `regex_not_match`
- `json_schema` (validate output parsed as JSON)
- `python` / `js` custom predicate (advanced; optional in v1)
  - e.g., `assert.type = "js_predicate"` with a path to a JS module exporting `(output, test) => boolean`

**Acceptance criteria**
- Assertions produce clear error details in trace/report (e.g., which field missing).

---

## 5) Nondeterminism / stability
**Modes**
- `off`: single run evaluation
- `strict`: candidate must fail on all repeats
- `kofn`: candidate fails if failures >= k out of n

**Implementation**
- For each candidate, run `n` trials and compute failure rate
- Cache each trial; store aggregated stats

**Acceptance criteria**
- Report includes `n`, `k`, failure count, and failure rate for baseline and final.
- If `confirm-final` is on, final prompt is re-checked with stricter settings (e.g., n=5).

---

## 6) Caching
**Requirements**
- Cache key includes:
  - candidate prompt hash
  - test id
  - runner type + model + temperature + max tokens + relevant params
- Disk cache directory: `.promptmin/cache/` (overridable)

**Acceptance criteria**
- Re-running the same command reuses cached results and is visibly faster.
- Cache can be disabled via `--cache off`.

---

## 7) “Best-so-far” behavior
If we hit budget/time limits:
- return the smallest failing candidate found so far if any
- if none preserved failure, return smallest candidate with highest failure rate (in kofn mode) and exit code `3`

**Acceptance criteria**
- Never silently return a passing prompt as “minimized”.
- Report clearly indicates whether final is guaranteed failing per target definition.

---

## 8) Python wrapper (thin)
**Goal**
- Provide `promptmin_py` that shells out to Node CLI with ergonomic Python API.

**Deliverables**
- `pip install promptmin`
- `promptmin-py minimize --prompt ... --config ...` delegates to Node binary
- Python API:
```python
from promptmin import minimize
result = minimize(prompt_path="...", config_path="...", out_dir="...")
print(result.minimized_prompt_path)
```

**Acceptance criteria**
- Wrapper bundles/locates Node binary (documented strategy) or requires Node installed; pick one and document clearly.
- Wrapper surfaces exit codes and paths.

---

## Security & Safety
- Never log raw API keys.
- Optional redaction step for trace/report:
  - redact patterns matching common secret formats
- Provide `--no-trace-output` flag for sensitive environments.

---

## Performance Targets
- MVP: reduce prompts under ~2,000 lines with <200 evals typical.
- Cache hit should make iterative runs near-instant except for new candidates.

---

## Repo Structure (proposal)
```
/packages/promptmin-cli
  /src
    chunking/
    minimize/
    runner/
    report/
    cache/
  package.json
  README.md

/packages/promptmin-py
  promptmin/__init__.py
  promptmin/cli.py
  pyproject.toml

/examples
  configs/
  prompts/
  runners/

/docs
  PRD.md
  DESIGN.md
```

---

## Milestones
### Milestone 0: Demo (1–2 days)
- Local command runner
- Chunking: headings + paragraphs
- Greedy minimizer
- Outputs: minimized.prompt + report.md

### Milestone 1: MVP (week 1)
- ddmin
- caching
- sentence-level minimization
- stable outputs + diff.patch
- fixture tests in repo

### Milestone 2: v1 (week 2)
- stability modes (strict/kofn)
- JSON schema assertions
- preserve selectors
- Python wrapper package

---

## Risks & Mitigations
- **LLM nondeterminism** → stability modes + temp=0 guidance + confirm-final
- **Cost explosion** → budgets + caching + chunk-first minimization
- **Chunking wrong** → safe fallback to plain text lines; extensive fixtures
- **Provider churn** → keep local-command runner first-class

---

## Open Questions (to decide early)
1. Do we ship with built-in OpenAI/Anthropic runners in v1, or rely on `local_command` first?
2. What “prompt file extensions” do we treat specially (`.prompt`, `.md`, `.txt`, `.yaml`)?
3. Do we include a token estimator dependency (tiktoken-like) or use a rough heuristic initially?
4. How do we mark “keep” regions? (HTML comment tags vs `# keep` lines vs config-only)
