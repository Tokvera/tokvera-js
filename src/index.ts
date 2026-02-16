import { type OpenAITrackEvent, type TrackOptions, type Usage } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

type AnyFunction = (...args: any[]) => Promise<any>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getUsage = (response: any): Usage | undefined => {
  const usage = response?.usage;
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  };
};

const buildEvent = (
  endpoint: OpenAITrackEvent["endpoint"],
  latencyMs: number,
  response: any,
  tags?: TrackOptions
): OpenAITrackEvent => ({
  event_type: "openai.request",
  timestamp: new Date().toISOString(),
  latency_ms: latencyMs,
  endpoint,
  model: response?.model,
  usage: getUsage(response),
  tags,
});

const sendWithRetry = async (event: OpenAITrackEvent) => {
  const url = process.env.TOKVERA_INGEST_URL;
  if (!url) return;

  const payload = JSON.stringify(event);

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return;
    } catch {
      clearTimeout(timeoutId);
      if (attempt >= DEFAULT_MAX_RETRIES) return;
      await sleep(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
    }
  }
};

const wrapCreate = (
  originalCreate: AnyFunction,
  endpoint: OpenAITrackEvent["endpoint"],
  tags?: TrackOptions
) => {
  return async (...args: any[]) => {
    const start = Date.now();
    const response = await originalCreate(...args);
    const latencyMs = Date.now() - start;
    const event = buildEvent(endpoint, latencyMs, response, tags);
    void sendWithRetry(event);
    return response;
  };
};

export const trackOpenAI = <T extends Record<string, any>>(
  openaiClient: T,
  options: TrackOptions = {}
): T => {
  const wrapper = Object.create(openaiClient) as T;

  const chatCreate = openaiClient?.chat?.completions?.create?.bind(
    openaiClient.chat.completions
  );
  const responsesCreate = openaiClient?.responses?.create?.bind(
    openaiClient.responses
  );

  if (!chatCreate || !responsesCreate) {
    throw new Error(
      "trackOpenAI expects openaiClient.chat.completions.create and openaiClient.responses.create"
    );
  }

  wrapper.chat = {
    ...openaiClient.chat,
    completions: {
      ...openaiClient.chat.completions,
      create: wrapCreate(chatCreate, "chat.completions.create", options),
    },
  };

  wrapper.responses = {
    ...openaiClient.responses,
    create: wrapCreate(responsesCreate, "responses.create", options),
  };

  return wrapper;
};

export type { OpenAITrackEvent, TrackOptions, Usage } from "./types.js";
