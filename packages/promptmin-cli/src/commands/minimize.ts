import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { readPromptText } from "../prompt/readPromptText.js";
import { ensureDir, writeFileAtomic } from "../util/fs.js";
import { hashText } from "../util/hash.js";
import { createBudgetState, EvalResult, evaluateTarget, BudgetState } from "../eval/evaluateTarget.js";
import { greedyMinimize } from "../minimize/greedyMinimize.js";
import { ddminMinimize } from "../minimize/ddminMinimize.js";
import { PromptminConfig } from "../config/loadConfig.js";
import { chunkPrompt } from "../prompt/chunkPrompt.js";
import { writeReportMarkdown } from "../report/writeReportMarkdown.js";
import { writeDiffPatch } from "../report/writeDiffPatch.js";
import fs from "node:fs/promises";

type Args = {
  promptPath: string;
  configPath: string;
  outDir: string;
  target: string;
  budgetRuns: number;
  maxMinutes: number;
  strategy: "ddmin" | "greedy";
  granularity: string;
  cache: "on" | "off";
  cacheDir: string;
  verbose: boolean;
  json: boolean;
};

type MinimizeResult = { minimizedText: string; finalEval: EvalResult; exitCode: number; reason?: string };

export async function minimizeCommand(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.promptPath || !args.configPath) {
    process.stderr.write("Missing required flags: --prompt and --config\n");
    return 1;
  }

  const outDirAbs = path.resolve(args.outDir);
  await ensureDir(outDirAbs);
  await ensureDir(path.join(outDirAbs, "candidates"));

  const config = await loadConfig(args.configPath);
  const configRaw = await fs.readFile(path.resolve(args.configPath), "utf8");
  const configHash = hashText(configRaw);
  const baselineText = await readPromptText(args.promptPath);
  const baselineHash = hashText(baselineText);

  const baselinePromptPath = path.join(outDirAbs, "baseline.prompt");
  await writeFileAtomic(baselinePromptPath, baselineText);

  const tracePath = path.join(outDirAbs, "trace.jsonl");
  await writeFileAtomic(tracePath, "");

  const startedAt = Date.now();
  const budget = createBudgetState({ maxRuns: args.budgetRuns, startedAt, maxMillis: args.maxMinutes * 60_000 });
  const cache = { enabled: args.cache !== "off", dirAbs: path.resolve(args.cacheDir) };
  let baselineEval: EvalResult;
	try {
	  baselineEval = await evaluateTarget({
	    config,
	    promptText: baselineText,
	    promptFile: baselinePromptPath,
	    promptHint: "baseline",
	    outDirAbs,
	    targetSelector: args.target,
	    tracePath,
	    budget,
	    verbose: args.verbose,
	    cache,
	  });
	} catch (err) {
    return await handleFatalMinimizeError({ err, outDirAbs, args, config, baselineText, baselineHash, startedAt });
  }

  if (!baselineEval.isFail) {
    await writeMetaJson({
      outDirAbs,
      args,
      configHash,
      baselineHash,
      minimizedHash: baselineHash,
      exitCode: 2,
      startedAt,
      budgetUsed: budget.runsUsed,
      runnerType: config.runner.type,
    });
    await writeReportMarkdown({
      outDirAbs,
      args,
      config,
      configHash,
      baselineHash,
      baselineEval,
      finalEval: baselineEval,
      baselineText,
      minimizedText: baselineText,
      minimizedHash: baselineHash,
      exitCode: 2,
      startedAt,
      budgetUsed: budget.runsUsed,
    });
    return 2;
  }

  let result: MinimizeResult;
  try {
    result = await minimizeWithStrategy({
      config,
      baselineText,
      baselineEval,
      outDirAbs,
      targetSelector: args.target,
      tracePath,
      budget,
      verbose: args.verbose,
      cache,
      strategy: args.strategy,
      granularity: args.granularity,
    });
  } catch (err) {
    return await handleFatalMinimizeError({ err, outDirAbs, args, config, baselineText, baselineHash, startedAt, baselineEval });
  }

  const minimizedPath = path.join(outDirAbs, "minimized.prompt");
  await writeFileAtomic(minimizedPath, result.minimizedText);

  await writeDiffPatch({
    outDirAbs,
    baselinePromptPath,
    minimizedPromptPath: minimizedPath,
  });

  await writeReportMarkdown({
    outDirAbs,
    args,
    config,
    configHash,
    baselineHash,
    baselineEval,
    finalEval: result.finalEval,
    baselineText,
    minimizedText: result.minimizedText,
    minimizedHash: hashText(result.minimizedText),
    exitCode: result.exitCode,
    startedAt,
    budgetUsed: budget.runsUsed,
    bestEffortReason: result.reason,
  });

  await writeMetaJson({
    outDirAbs,
    args,
    configHash,
    baselineHash,
    minimizedHash: hashText(result.minimizedText),
    exitCode: result.exitCode,
    startedAt,
    budgetUsed: budget.runsUsed,
    runnerType: config.runner.type,
  });

  if (args.json) {
    const reportJsonPath = path.join(outDirAbs, "report.json");
    await writeFileAtomic(
      reportJsonPath,
      JSON.stringify(
        {
          baseline: baselineEval,
          final: result.finalEval,
          exitCode: result.exitCode,
          reason: result.reason ?? null,
          minimized_prompt_path: minimizedPath,
        },
        null,
        2,
      ) + "\n",
    );
  }

  return result.exitCode;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    promptPath: "",
    configPath: "",
    outDir: ".promptmin/out",
    target: "suite:any",
    budgetRuns: 200,
    maxMinutes: 20,
    strategy: "ddmin",
    granularity: "blocks",
    cache: "on",
    cacheDir: ".promptmin/cache",
    verbose: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--prompt") args.promptPath = argv[++i] || "";
    else if (token === "--config") args.configPath = argv[++i] || "";
    else if (token === "--out") args.outDir = argv[++i] || args.outDir;
    else if (token === "--target") args.target = argv[++i] || args.target;
    else if (token === "--budget-runs") args.budgetRuns = Number(argv[++i] || args.budgetRuns);
    else if (token === "--max-minutes") args.maxMinutes = Number(argv[++i] || args.maxMinutes);
    else if (token === "--strategy") args.strategy = parseStrategy(argv[++i] || "");
    else if (token === "--granularity") args.granularity = argv[++i] || args.granularity;
    else if (token === "--cache") args.cache = parseCacheMode(argv[++i] || "");
    else if (token === "--cache-dir") args.cacheDir = argv[++i] || args.cacheDir;
    else if (token === "--verbose") args.verbose = true;
    else if (token === "--json") args.json = true;
    else if (token === "-h" || token === "--help") {
      process.stdout.write(
        [
          "promptmin minimize --prompt <path> --config <path> [--out <dir>]",
          "",
          "Options:",
          "  --strategy <ddmin|greedy>     default: ddmin",
          "  --granularity <sections|blocks|sentences|lines>   default: blocks",
          "  --budget-runs <int>           default: 200",
          "  --max-minutes <int>           default: 20",
          "  --cache <on|off>              default: on",
          "  --cache-dir <dir>             default: .promptmin/cache",
          "  --target <suite:any|suite:all|test:<id>>",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${token}\n`);
      process.exit(1);
    }
  }
  return args;
}

function parseStrategy(s: string): Args["strategy"] {
  if (s === "ddmin" || s === "greedy") return s;
  process.stderr.write(`invalid --strategy: ${s}\n`);
  process.exit(1);
}

function parseCacheMode(s: string): Args["cache"] {
  if (s === "on" || s === "off") return s;
  process.stderr.write(`invalid --cache: ${s}\n`);
  process.exit(1);
}

async function minimizeWithStrategy(params: {
  config: PromptminConfig;
  baselineText: string;
  baselineEval: EvalResult;
  outDirAbs: string;
  targetSelector: string;
  tracePath: string;
  budget: BudgetState;
  verbose: boolean;
  cache: { enabled: boolean; dirAbs: string };
  strategy: Args["strategy"];
  granularity: string;
}): Promise<MinimizeResult> {
  if (params.strategy === "greedy") {
    const chunks = chunkPrompt(params.baselineText, params.granularity, { preserve: params.config.prompt?.preserve });
    return await greedyMinimize({
      config: params.config,
      baselineText: params.baselineText,
      baselineEval: params.baselineEval,
      chunks,
      outDirAbs: params.outDirAbs,
      targetSelector: params.targetSelector,
      tracePath: params.tracePath,
      budget: params.budget,
      verbose: params.verbose,
      cache: params.cache,
    });
  }

  let currentText = params.baselineText;
  let currentEval = params.baselineEval;

  for (const level of levelsUpTo(params.granularity)) {
    const chunks = chunkPrompt(currentText, level, { preserve: params.config.prompt?.preserve });
    const minimized = await ddminMinimize({
      config: params.config,
      baselineEval: currentEval,
      chunks,
      outDirAbs: params.outDirAbs,
      targetSelector: params.targetSelector,
      tracePath: params.tracePath,
      budget: params.budget,
      verbose: params.verbose,
      cache: params.cache,
    });
    currentText = minimized.minimizedText;
    currentEval = minimized.finalEval;
    if (minimized.exitCode === 3) return minimized;
  }

  return { minimizedText: currentText, finalEval: currentEval, exitCode: currentEval.isFail ? 0 : 3 };
}

function levelsUpTo(granularity: string): Array<"sections" | "blocks" | "sentences" | "lines"> {
  const g = granularity || "blocks";
  if (g === "sections") return ["sections"];
  if (g === "blocks") return ["sections", "blocks"];
  if (g === "sentences") return ["sections", "blocks", "sentences"];
  if (g === "lines") return ["sections", "blocks", "lines"];
  throw new Error(`unsupported --granularity: ${granularity}`);
}

async function handleFatalMinimizeError(params: {
  err: unknown;
  outDirAbs: string;
  args: Args;
  config: PromptminConfig;
  baselineText: string;
  baselineHash: string;
  startedAt: number;
  baselineEval?: EvalResult;
}): Promise<number> {
  const message = String((params.err as any)?.message || params.err);
  const exitCode = message.startsWith("budget exceeded") ? 3 : 4;
  const baselineEval =
    params.baselineEval ?? ({ isFail: false, failingTests: [{ id: "(error)", reason: message }], totalRuns: 0 } as EvalResult);

  await writeMetaJson({
    outDirAbs: params.outDirAbs,
    args: params.args,
    configHash: "(unknown)",
    baselineHash: params.baselineHash,
    minimizedHash: params.baselineHash,
    exitCode,
    startedAt: params.startedAt,
    budgetUsed: undefined,
    runnerType: params.config.runner.type,
    fatalError: message,
  });

  await writeReportMarkdown({
    outDirAbs: params.outDirAbs,
    args: params.args,
    config: params.config,
    configHash: "(unknown)",
    baselineHash: params.baselineHash,
    baselineEval,
    finalEval: baselineEval,
    baselineText: params.baselineText,
    minimizedText: params.baselineText,
    minimizedHash: params.baselineHash,
    exitCode,
    startedAt: params.startedAt,
  });
  process.stderr.write(message + "\n");
  return exitCode;
}

async function writeMetaJson(params: {
  outDirAbs: string;
  args: Args;
  configHash: string;
  baselineHash: string;
  minimizedHash: string;
  exitCode: number;
  startedAt: number;
  budgetUsed?: number;
  runnerType: string;
  fatalError?: string;
}): Promise<void> {
  const metaPath = path.join(params.outDirAbs, "meta.json");
  const meta = {
    created_at: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    runner: params.runnerType,
    exit_code: params.exitCode,
    paths: {
      out_dir: params.args.outDir,
      baseline_prompt: "baseline.prompt",
      minimized_prompt: "minimized.prompt",
      trace: "trace.jsonl",
      diff: "diff.patch",
      meta: "meta.json",
      candidates_dir: "candidates",
      cache_dir: params.args.cacheDir,
    },
    args: {
      prompt: params.args.promptPath,
      config: params.args.configPath,
      out: params.args.outDir,
      target: params.args.target,
      strategy: params.args.strategy,
      granularity: params.args.granularity,
      budget_runs: params.args.budgetRuns,
      max_minutes: params.args.maxMinutes,
      cache: params.args.cache,
      cache_dir: params.args.cacheDir,
    },
    hashes: {
      config: params.configHash,
      baseline_prompt: params.baselineHash,
      minimized_prompt: params.minimizedHash,
    },
    budget: {
      runs_used: params.budgetUsed ?? null,
      max_runs: params.args.budgetRuns,
    },
    fatal_error: params.fatalError ?? null,
  };
  await writeFileAtomic(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
