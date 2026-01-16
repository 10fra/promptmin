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

type Args = {
  promptPath: string;
  configPath: string;
  outDir: string;
  target: string;
  budgetRuns: number;
  maxMinutes: number;
  strategy: "ddmin" | "greedy";
  granularity: string;
  verbose: boolean;
  json: boolean;
};

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
  const baselineText = await readPromptText(args.promptPath);
  const baselineHash = hashText(baselineText);

  const baselinePromptPath = path.join(outDirAbs, "baseline.prompt");
  await writeFileAtomic(baselinePromptPath, baselineText);

  const tracePath = path.join(outDirAbs, "trace.jsonl");
  await writeFileAtomic(tracePath, "");

  const startedAt = Date.now();
  const budget = createBudgetState({ maxRuns: args.budgetRuns, startedAt, maxMillis: args.maxMinutes * 60_000 });
  let baselineEval: EvalResult;
  try {
    baselineEval = await evaluateTarget({
      config,
      promptText: baselineText,
      promptHint: "baseline",
      outDirAbs,
      targetSelector: args.target,
      tracePath,
      budget,
      verbose: args.verbose,
    });
  } catch (err) {
    return await handleFatalMinimizeError({ err, outDirAbs, args, config, baselineText, baselineHash, startedAt });
  }

  if (!baselineEval.isFail) {
    await writeReportMarkdown({
      outDirAbs,
      args,
      config,
      baselineHash,
      baselineEval,
      finalEval: baselineEval,
      minimizedText: baselineText,
      minimizedHash: baselineHash,
      exitCode: 2,
      startedAt,
    });
    return 2;
  }

  let result: { minimizedText: string; finalEval: EvalResult; exitCode: number };
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
    baselineHash,
    baselineEval,
    finalEval: result.finalEval,
    minimizedText: result.minimizedText,
    minimizedHash: hashText(result.minimizedText),
    exitCode: result.exitCode,
    startedAt,
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
    else if (token === "--verbose") args.verbose = true;
    else if (token === "--json") args.json = true;
    else if (token === "-h" || token === "--help") {
      process.stdout.write(
        [
          "promptmin minimize --prompt <path> --config <path> [--out <dir>]",
          "",
          "Options:",
          "  --strategy <ddmin|greedy>     default: ddmin",
          "  --granularity <sections|blocks|lines>   default: blocks",
          "  --budget-runs <int>           default: 200",
          "  --max-minutes <int>           default: 20",
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

async function minimizeWithStrategy(params: {
  config: PromptminConfig;
  baselineText: string;
  baselineEval: EvalResult;
  outDirAbs: string;
  targetSelector: string;
  tracePath: string;
  budget: BudgetState;
  verbose: boolean;
  strategy: Args["strategy"];
  granularity: string;
}) {
  if (params.strategy === "greedy") {
    const chunks = chunkPrompt(params.baselineText, params.granularity);
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
    });
  }

  let currentText = params.baselineText;
  let currentEval = params.baselineEval;

  for (const level of levelsUpTo(params.granularity)) {
    const chunks = chunkPrompt(currentText, level);
    const minimized = await ddminMinimize({
      config: params.config,
      baselineEval: currentEval,
      chunks,
      outDirAbs: params.outDirAbs,
      targetSelector: params.targetSelector,
      tracePath: params.tracePath,
      budget: params.budget,
      verbose: params.verbose,
    });
    currentText = minimized.minimizedText;
    currentEval = minimized.finalEval;
    if (minimized.exitCode === 3) return minimized;
  }

  return { minimizedText: currentText, finalEval: currentEval, exitCode: currentEval.isFail ? 0 : 3 };
}

function levelsUpTo(granularity: string): Array<"sections" | "blocks" | "lines"> {
  const g = granularity || "blocks";
  if (g === "sections") return ["sections"];
  if (g === "blocks") return ["sections", "blocks"];
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

  await writeReportMarkdown({
    outDirAbs: params.outDirAbs,
    args: params.args,
    config: params.config,
    baselineHash: params.baselineHash,
    baselineEval,
    finalEval: baselineEval,
    minimizedText: params.baselineText,
    minimizedHash: params.baselineHash,
    exitCode,
    startedAt: params.startedAt,
  });
  process.stderr.write(message + "\n");
  return exitCode;
}
