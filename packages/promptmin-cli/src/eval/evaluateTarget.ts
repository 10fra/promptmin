import { PromptminConfig, TestConfig } from "../config/loadConfig.js";
import { runLocalCommand } from "../runner/runLocalCommand.js";
import { assertOutput } from "./assertOutput.js";
import { hashText } from "../util/hash.js";
import { writeJsonlAppend } from "../util/jsonl.js";
import { DiskCache, readCache, writeCache } from "../cache/diskCache.js";
import path from "node:path";
import fs from "node:fs/promises";
import { writeFileAtomic, ensureDir } from "../util/fs.js";

export type BudgetState = { maxRuns: number; startedAt: number; maxMillis: number; runsUsed: number };

export function createBudgetState(params: { maxRuns: number; startedAt: number; maxMillis: number }): BudgetState {
  return { ...params, runsUsed: 0 };
}

export type StabilityConfig =
  | { mode: "off" }
  | { mode: "strict"; n: number }
  | { mode: "kofn"; n: number; k: number };

export type EvalResult = {
  isFail: boolean;
  failingTests: { id: string; reason: string }[];
  totalRuns: number;
};

export async function evaluateTarget(params: {
  config: PromptminConfig;
  promptText: string;
  promptFile?: string;
  promptHint: string;
  outDirAbs: string;
  targetSelector: string;
  tracePath: string;
  budget: BudgetState;
  verbose: boolean;
  cache?: { enabled: boolean; dirAbs: string };
  stability?: StabilityConfig;
}): Promise<EvalResult> {
  const { config } = params;
  const tests = config.tests;
  const target = parseTarget(params.targetSelector);
  const stability = normalizeStability(params.stability);

  const failing: { id: string; reason: string }[] = [];
  let runs = 0;

  for (const test of tests) {
    if (target.mode === "test" && test.id !== target.id) continue;

    const promptFile = params.promptFile ?? (await ensureCandidatePromptFile(params.outDirAbs, params.promptText));
    const evalOne = await evalTestStable({
      config,
      test,
      promptText: params.promptText,
      promptFile,
      budget: params.budget,
      cache: params.cache,
      stability,
    });
    runs += evalOne.trials;

    await writeJsonlAppend(params.tracePath, {
      at: new Date().toISOString(),
      kind: "eval",
      prompt_hash: hashText(params.promptText),
      prompt_file: promptFile,
      prompt_hint: params.promptHint,
      test_id: test.id,
      ok: evalOne.ok,
      reason: evalOne.reason,
      cache_hit: evalOne.cacheHit ?? null,
      stability: { mode: stability.mode, n: stability.n, k: stability.k },
      failures: evalOne.failures,
      trials: evalOne.trials,
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

async function evalTestOnce(params: {
  config: PromptminConfig;
  test: TestConfig;
  promptText: string;
  promptFile?: string;
  trialIndex: number;
  stability: { mode: "off" | "strict" | "kofn"; n: number; k: number };
  budget: BudgetState;
  cache?: { enabled: boolean; dirAbs: string };
}): Promise<{ ok: boolean; reason: string; cacheHit?: boolean }> {
  const { config, test, promptText } = params;

  if (config.runner.type !== "local_command") {
    return { ok: false, reason: `unsupported runner.type: ${config.runner.type}` };
  }

  const cacheEnabled = params.cache?.enabled !== false;
  const cache = params.cache?.dirAbs ? ({ dirAbs: params.cache.dirAbs } satisfies DiskCache) : null;
  const cacheKey = hashText(
    [
      "runner=local_command",
      `command=${config.runner.command.join("\u0000")}`,
      `prompt=${hashText(promptText)}`,
      `test_id=${test.id}`,
      `test_input=${JSON.stringify(test.input)}`,
      `test_assert=${JSON.stringify(test.assert)}`,
      `stability_mode=${params.stability.mode}`,
      `stability_n=${params.stability.n}`,
      `stability_k=${params.stability.k}`,
      `trial_index=${params.trialIndex}`,
    ].join("\n"),
  );

  if (cacheEnabled && cache) {
    const cached = await readCache(cache, cacheKey);
    if (cached !== null) {
      const asserted = assertOutput({ output: cached, test });
      return asserted.ok ? { ok: true, reason: "ok", cacheHit: true } : { ok: false, reason: asserted.reason, cacheHit: true };
    }
  }

  consumeRun(params.budget);
  const output = await runLocalCommand({
    command: config.runner.command,
    promptText,
    promptFile: params.promptFile,
    test,
    trialIndex: params.trialIndex,
    trialCount: params.stability.n,
  });
  if (cacheEnabled && cache) await writeCache(cache, cacheKey, output);

  const asserted = assertOutput({ output, test });
  return asserted.ok
    ? { ok: true, reason: "ok", cacheHit: false }
    : { ok: false, reason: asserted.reason, cacheHit: false };
}

async function evalTestStable(params: {
  config: PromptminConfig;
  test: TestConfig;
  promptText: string;
  promptFile: string;
  budget: BudgetState;
  cache?: { enabled: boolean; dirAbs: string };
  stability: { mode: "off" | "strict" | "kofn"; n: number; k: number };
}): Promise<{ ok: boolean; reason: string; failures: number; trials: number; cacheHit?: boolean }> {
  const { stability } = params;
  const trials = stability.n;
  let failures = 0;
  let anyCacheHit = true;
  let firstFailureReason: string | null = null;

  for (let i = 0; i < trials; i++) {
    const one = await evalTestOnce({
      config: params.config,
      test: params.test,
      promptText: params.promptText,
      promptFile: params.promptFile,
      trialIndex: i,
      stability,
      budget: params.budget,
      cache: params.cache,
    });
    if (one.cacheHit === false) anyCacheHit = false;
    if (!one.ok) {
      failures++;
      if (!firstFailureReason) firstFailureReason = one.reason;
    }
  }

  const isFail =
    stability.mode === "strict" ? failures === trials : stability.mode === "kofn" ? failures >= stability.k : failures >= 1;
  const ok = !isFail;
  const reasonBase = firstFailureReason || "ok";
  const reason = `${reasonBase} (failures=${failures}/${trials}, mode=${stability.mode}${stability.mode === "kofn" ? ` k=${stability.k}` : ""})`;
  return { ok, reason, failures, trials, cacheHit: trials > 0 ? anyCacheHit : undefined };
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

async function ensureCandidatePromptFile(outDirAbs: string, promptText: string): Promise<string> {
  const dir = path.join(outDirAbs, "candidates");
  await ensureDir(dir);
  const filePath = path.join(dir, `${hashText(promptText)}.prompt`);
  try {
    await fs.access(filePath);
    return filePath;
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  await writeFileAtomic(filePath, promptText);
  return filePath;
}

function normalizeStability(stability?: StabilityConfig): { mode: "off" | "strict" | "kofn"; n: number; k: number } {
  if (!stability || stability.mode === "off") return { mode: "off", n: 1, k: 1 };
  if (stability.mode === "strict") {
    const n = clampInt(stability.n, 1, 1000);
    return { mode: "strict", n, k: n };
  }
  if (stability.mode === "kofn") {
    const n = clampInt(stability.n, 1, 1000);
    const k = clampInt(stability.k, 1, n);
    return { mode: "kofn", n, k };
  }
  return { mode: "off", n: 1, k: 1 };
}

function clampInt(x: number, min: number, max: number): number {
  const n = Number.isFinite(x) ? Math.floor(x) : min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
