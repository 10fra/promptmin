import { OpenAIResponsesRunnerConfig, TestConfig } from "../config/loadConfig.js";
import { extractPromptMessages } from "../prompt/roleBlocks.js";
import { redactSecrets } from "../util/redact.js";

export async function runOpenAIResponses(params: {
  runner: OpenAIResponsesRunnerConfig;
  promptText: string;
  test: TestConfig;
  trialIndex: number;
  trialCount: number;
}): Promise<string> {
  const apiKeyEnv = params.runner.api_key_env || "OPENAI_API_KEY";
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new Error(`missing OpenAI API key env: ${apiKeyEnv}`);

  const baseUrl = (params.runner.base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/responses`;

  const userInput =
    typeof (params.test.input as any)?.user === "string" ? String((params.test.input as any).user) : JSON.stringify(params.test.input);

  const messages = extractPromptMessages(params.promptText).messages;

  const body: any = {
    model: params.runner.model,
    input: [...messages, { role: "user", content: userInput }],
    temperature: params.runner.temperature ?? 0,
    max_output_tokens: params.runner.max_output_tokens ?? 800,
    metadata: {
      test_id: params.test.id,
      trial_index: params.trialIndex,
      trial_count: params.trialCount,
    },
  };

  const timeoutMs = params.runner.timeout_ms ?? 60_000;
  const maxRetries = Math.max(0, Math.floor(params.runner.max_retries ?? 2));

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        if (attempt < maxRetries && shouldRetryStatus(res.status)) {
          await sleep(retryDelayMs(attempt, res.headers.get("retry-after")));
          attempt++;
          continue;
        }
        throw new Error(`openai_responses http ${res.status}: ${truncate(redactSecrets(text), 800)}`);
      }

      const parsed = JSON.parse(text);
      return extractOutputText(parsed);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(attempt, null));
          attempt++;
          continue;
        }
        throw new Error(`openai_responses timeout after ${timeoutMs}ms`);
      }
      if (attempt < maxRetries && isRetryableNetworkError(err)) {
        await sleep(retryDelayMs(attempt, null));
        attempt++;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;
  const output = Array.isArray(response?.output) ? response.output : [];
  const texts: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const t = part?.text;
      if (typeof t === "string") texts.push(t);
    }
  }

  if (texts.length) return texts.join("");

  if (typeof response?.text === "string") return response.text;
  return "";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function isRetryableNetworkError(err: any): boolean {
  const code = String(err?.code || "");
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN";
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const header = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(header) && header > 0) return Math.min(30_000, header * 1000);
  const base = 250;
  const exp = Math.min(10_000, base * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 100);
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
