import { PromptminConfig } from "../config/loadConfig.js";
import { BudgetState, EvalResult, evaluateTarget } from "../eval/evaluateTarget.js";
import { hashText } from "../util/hash.js";
import { writeJsonlAppend } from "../util/jsonl.js";
import { Chunk } from "./greedyMinimize.js";
import { ddminReduce } from "./ddmin.js";

export async function ddminMinimize(params: {
  config: PromptminConfig;
  baselineEval: EvalResult;
  chunks: Chunk[];
  outDirAbs: string;
  targetSelector: string;
  tracePath: string;
  budget: BudgetState;
  verbose: boolean;
}): Promise<{ minimizedText: string; finalEval: EvalResult; exitCode: number }> {
  let lastFailingText = params.chunks.map((c) => c.text).join("");
  let lastEval: EvalResult = params.baselineEval;

  let reduced: Chunk[];
  try {
    reduced = await ddminReduce({
      items: params.chunks,
      minSize: 1,
      isFail: async (candidateChunks) => {
        const candidateText = candidateChunks.map((c) => c.text).join("");
        if (!candidateText.trim()) return false;

        const candidateEval = await evaluateTarget({
          config: params.config,
          promptText: candidateText,
          promptHint: `ddmin:chunks=${candidateChunks.length}`,
          outDirAbs: params.outDirAbs,
          targetSelector: params.targetSelector,
          tracePath: params.tracePath,
          budget: params.budget,
          verbose: params.verbose,
        });

        await writeJsonlAppend(params.tracePath, {
          at: new Date().toISOString(),
          kind: "candidate",
          strategy: "ddmin",
          kept_chunks: candidateChunks.length,
          prompt_hash: hashText(candidateText),
          is_fail: candidateEval.isFail,
        });

        if (candidateEval.isFail) {
          lastFailingText = candidateText;
          lastEval = candidateEval;
        }

        return candidateEval.isFail;
      },
    });
  } catch (err) {
    const message = String((err as any)?.message || err);
    if (message.startsWith("budget exceeded")) {
      return { minimizedText: lastFailingText, finalEval: lastEval, exitCode: 3 };
    }
    throw err;
  }

  const finalEval = lastEval;

  const exitCode = finalEval.isFail ? 0 : 3;
  return { minimizedText: lastFailingText, finalEval, exitCode };
}
