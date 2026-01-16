import { PromptminConfig } from "../config/loadConfig.js";
import { BudgetState, EvalResult, evaluateTarget, StabilityConfig } from "../eval/evaluateTarget.js";
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
  tracePath: string | null;
  budget: BudgetState;
  verbose: boolean;
  cache?: { enabled: boolean; dirAbs: string };
  stability?: StabilityConfig;
}): Promise<{ minimizedText: string; finalEval: EvalResult; exitCode: number; reason?: string }> {
  let lastFailingText = params.chunks.map((c) => c.text).join("");
  let lastEval: EvalResult = params.baselineEval;

  const removable = params.chunks
    .map((c, idx) => (c.preserve ? null : idx))
    .filter((x): x is number => typeof x === "number");
  if (removable.length === 0) {
    return { minimizedText: lastFailingText, finalEval: lastEval, exitCode: 0 };
  }

  try {
    await ddminReduce({
      items: removable,
      minSize: 0,
      isFail: async (kept) => {
        const keepSet = new Set(kept);
        const candidateText = params.chunks
          .filter((c, idx) => c.preserve || keepSet.has(idx))
          .map((c) => c.text)
          .join("");
        if (!candidateText.trim()) return false;

        const candidateEval = await evaluateTarget({
          config: params.config,
          promptText: candidateText,
          promptHint: `ddmin:chunks=${kept.length}`,
          outDirAbs: params.outDirAbs,
          targetSelector: params.targetSelector,
          tracePath: params.tracePath,
          budget: params.budget,
          verbose: params.verbose,
          cache: params.cache,
          stability: params.stability,
        });

        await writeJsonlAppend(params.tracePath, {
          at: new Date().toISOString(),
          kind: "candidate",
          strategy: "ddmin",
          kept_chunks: kept.length,
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
      return { minimizedText: lastFailingText, finalEval: lastEval, exitCode: 3, reason: message };
    }
    throw err;
  }

  const finalEval = lastEval;

  const exitCode = finalEval.isFail ? 0 : 3;
  return { minimizedText: lastFailingText, finalEval, exitCode };
}
