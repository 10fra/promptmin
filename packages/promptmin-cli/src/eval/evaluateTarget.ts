import { PromptminConfig, TestConfig } from "../config/loadConfig.js";
import { runLocalCommand } from "../runner/runLocalCommand.js";
import { assertOutput } from "./assertOutput.js";
import { hashText } from "../util/hash.js";
import { writeJsonlAppend } from "../util/jsonl.js";

export type BudgetState = { maxRuns: number; startedAt: number; maxMillis: number; runsUsed: number };

export function createBudgetState(params: { maxRuns: number; startedAt: number; maxMillis: number }): BudgetState {
  return { ...params, runsUsed: 0 };
}

export type EvalResult = {
  isFail: boolean;
  failingTests: { id: string; reason: string }[];
  totalRuns: number;
};

export async function evaluateTarget(params: {
  config: PromptminConfig;
  promptText: string;
  promptHint: string;
  outDirAbs: string;
  targetSelector: string;
  tracePath: string;
  budget: BudgetState;
  verbose: boolean;
}): Promise<EvalResult> {
  const { config } = params;
  const tests = config.tests;
  const target = parseTarget(params.targetSelector);

  const failing: { id: string; reason: string }[] = [];
  let runs = 0;

  for (const test of tests) {
    if (target.mode === "test" && test.id !== target.id) continue;

    runs++;
    consumeRun(params.budget);
    const evalOne = await evalTestOnce({ config, test, promptText: params.promptText });

    await writeJsonlAppend(params.tracePath, {
      at: new Date().toISOString(),
      kind: "eval",
      prompt_hash: hashText(params.promptText),
      prompt_hint: params.promptHint,
      test_id: test.id,
      ok: evalOne.ok,
      reason: evalOne.reason,
    });

    if (!evalOne.ok) failing.push({ id: test.id, reason: evalOne.reason });
    if (params.verbose) process.stderr.write(`[eval] ${test.id}: ${evalOne.ok ? "ok" : "FAIL"}\n`);

    if (target.mode === "suite_any" && failing.length > 0) break;
  }

  const isFail =
    target.mode === "suite_all"
      ? failing.length === tests.length
      : target.mode === "test"
        ? failing.some((t) => t.id === target.id)
        : failing.length > 0;

  return { isFail, failingTests: failing, totalRuns: runs };
}

async function evalTestOnce(params: { config: PromptminConfig; test: TestConfig; promptText: string }) {
  const { config, test, promptText } = params;

  if (config.runner.type !== "local_command") {
    return { ok: false, reason: `unsupported runner.type: ${config.runner.type}` };
  }

  const output = await runLocalCommand({
    command: config.runner.command,
    promptText,
    test,
  });

  const asserted = assertOutput({ output, test });
  return asserted.ok ? { ok: true, reason: "ok" } : { ok: false, reason: asserted.reason };
}

function parseTarget(selector: string):
  | { mode: "suite_any" }
  | { mode: "suite_all" }
  | { mode: "test"; id: string } {
  const s = selector || "suite:any";
  if (s === "suite:any") return { mode: "suite_any" };
  if (s === "suite:all") return { mode: "suite_all" };
  if (s.startsWith("test:")) return { mode: "test", id: s.slice("test:".length) };
  throw new Error(`invalid --target: ${selector}`);
}

function consumeRun(budget: BudgetState) {
  if (Date.now() - budget.startedAt > budget.maxMillis) throw new Error(`budget exceeded: maxMinutes`);
  budget.runsUsed++;
  if (budget.runsUsed > budget.maxRuns) throw new Error(`budget exceeded: maxRuns=${budget.maxRuns}`);
}
