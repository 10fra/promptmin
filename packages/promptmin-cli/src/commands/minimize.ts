import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { readPromptText } from "../prompt/readPromptText.js";
import { ensureDir, writeFileAtomic } from "../util/fs.js";
import { hashText } from "../util/hash.js";
import { evaluateTarget } from "../eval/evaluateTarget.js";
import { greedyMinimize } from "../minimize/greedyMinimize.js";
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
  const baselineEval = await evaluateTarget({
    config,
    promptText: baselineText,
    promptHint: "baseline",
    outDirAbs,
    targetSelector: args.target,
    tracePath,
    budget: { maxRuns: args.budgetRuns, startedAt, maxMillis: args.maxMinutes * 60_000 },
    verbose: args.verbose,
  });

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

  const chunks = chunkPrompt(baselineText, args.granularity);
  const result = await greedyMinimize({
    config,
    baselineText,
    baselineEval,
    chunks,
    outDirAbs,
    targetSelector: args.target,
    tracePath,
    budget: { maxRuns: args.budgetRuns, startedAt, maxMillis: args.maxMinutes * 60_000 },
    verbose: args.verbose,
  });

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
    else if (token === "--granularity") args.granularity = argv[++i] || args.granularity;
    else if (token === "--verbose") args.verbose = true;
    else if (token === "--json") args.json = true;
    else if (token === "-h" || token === "--help") {
      process.stdout.write("promptmin minimize --prompt <path> --config <path> [--out <dir>]\n");
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${token}\n`);
      process.exit(1);
    }
  }
  return args;
}

