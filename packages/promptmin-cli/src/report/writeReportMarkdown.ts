import path from "node:path";
import { PromptminConfig } from "../config/loadConfig.js";
import { EvalResult } from "../eval/evaluateTarget.js";
import { writeFileAtomic } from "../util/fs.js";

export async function writeReportMarkdown(params: {
  outDirAbs: string;
  args: {
    promptPath: string;
    configPath: string;
    outDir: string;
    target: string;
    budgetRuns: number;
    maxMinutes: number;
    strategy?: string;
    granularity: string;
    cache?: string;
    cacheDir?: string;
  };
  config: PromptminConfig;
  configHash: string;
  baselineHash: string;
  baselineEval: EvalResult;
  finalEval: EvalResult;
  baselineText: string;
  minimizedText: string;
  minimizedHash: string;
  exitCode: number;
  startedAt: number;
  budgetUsed?: number;
  bestEffortReason?: string;
}): Promise<void> {
  const durationMs = Date.now() - params.startedAt;
  const baselineChars = params.baselineText.length;
  const minimizedChars = params.minimizedText.length;
  const baselineLines = countLines(params.baselineText);
  const minimizedLines = countLines(params.minimizedText);
  const reducedChars = baselineChars - minimizedChars;
  const reducedLines = baselineLines - minimizedLines;
  const pct = baselineChars > 0 ? Math.round((reducedChars / baselineChars) * 100) : 0;
  const report = [
    "# promptmin report",
    "",
    "## Command",
    "```bash",
    `promptmin minimize --prompt ${params.args.promptPath} --config ${params.args.configPath} --out ${params.args.outDir} --target ${params.args.target} --budget-runs ${params.args.budgetRuns} --max-minutes ${params.args.maxMinutes} --strategy ${params.args.strategy || "ddmin"} --granularity ${params.args.granularity} --cache ${params.args.cache || "on"} --cache-dir ${params.args.cacheDir || ".promptmin/cache"}`,
    "```",
    "",
    "## Baseline",
    `- hash: \`${params.baselineHash}\``,
    `- failing: \`${params.baselineEval.isFail}\``,
    `- failing tests: ${formatFailing(params.baselineEval)}`,
    `- config_hash: \`${params.configHash}\``,
    "",
    "## Final",
    `- hash: \`${params.minimizedHash}\``,
    `- failing: \`${params.finalEval.isFail}\``,
    `- failing tests: ${formatFailing(params.finalEval)}`,
    "",
    "## Size",
    `- baseline: ${baselineChars} chars, ${baselineLines} lines`,
    `- minimized: ${minimizedChars} chars, ${minimizedLines} lines`,
    `- reduced: ${reducedChars} chars (${pct}%), ${reducedLines} lines`,
    "",
    "## Budget",
    `- runs_used: ${params.budgetUsed ?? "(unknown)"} / ${params.args.budgetRuns}`,
    `- max_minutes: ${params.args.maxMinutes}`,
    ...(params.exitCode === 3
      ? [
          "",
          "## Best-so-far",
          "- hit budget/time limit; result may not be minimal",
          params.bestEffortReason ? `- reason: \`${params.bestEffortReason}\`` : "- reason: `(unknown)`",
        ]
      : []),
    "",
    "## Meta",
    `- runner: \`${params.config.runner.type}\``,
    `- exit code: \`${params.exitCode}\``,
    `- cache: \`${params.args.cache || "on"}\``,
    `- cache_dir: \`${params.args.cacheDir || ".promptmin/cache"}\``,
    `- duration_ms: ${durationMs}`,
    "",
  ].join("\n");

  await writeFileAtomic(path.join(params.outDirAbs, "report.md"), report);
}

function formatFailing(evalResult: EvalResult): string {
  if (evalResult.failingTests.length === 0) return "`(none)`";
  return evalResult.failingTests.map((t) => `\`${t.id}\``).join(", ");
}

function countLines(text: string): number {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") count++;
  return count;
}
