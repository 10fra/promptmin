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
    granularity: string;
  };
  config: PromptminConfig;
  baselineHash: string;
  baselineEval: EvalResult;
  finalEval: EvalResult;
  minimizedText: string;
  minimizedHash: string;
  exitCode: number;
  startedAt: number;
}): Promise<void> {
  const durationMs = Date.now() - params.startedAt;
  const report = [
    "# promptmin report",
    "",
    "## Command",
    "```bash",
    `promptmin minimize --prompt ${params.args.promptPath} --config ${params.args.configPath} --out ${params.args.outDir} --target ${params.args.target} --budget-runs ${params.args.budgetRuns} --max-minutes ${params.args.maxMinutes} --granularity ${params.args.granularity}`,
    "```",
    "",
    "## Baseline",
    `- hash: \`${params.baselineHash}\``,
    `- failing: \`${params.baselineEval.isFail}\``,
    `- failing tests: ${formatFailing(params.baselineEval)}`,
    "",
    "## Final",
    `- hash: \`${params.minimizedHash}\``,
    `- failing: \`${params.finalEval.isFail}\``,
    `- failing tests: ${formatFailing(params.finalEval)}`,
    "",
    "## Size",
    `- chars: ${params.minimizedText.length}`,
    `- lines: ${params.minimizedText.split(/\\n/).length}`,
    "",
    "## Meta",
    `- runner: \`${params.config.runner.type}\``,
    `- exit code: \`${params.exitCode}\``,
    `- duration_ms: ${durationMs}`,
    "",
  ].join("\n");

  await writeFileAtomic(path.join(params.outDirAbs, "report.md"), report);
}

function formatFailing(evalResult: EvalResult): string {
  if (evalResult.failingTests.length === 0) return "`(none)`";
  return evalResult.failingTests.map((t) => `\`${t.id}\``).join(", ");
}

