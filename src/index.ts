import {
  type OpenAITrackEvent,
  type TrackOptions,
  type TrackTags,
  type Usage,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

type AnyFunction = (...args: any[]) => Promise<any>;

type OpenAIClientShape = {
  chat: {
    completions: {
      create: AnyFunction;
    };
  };
  responses: {
    create: AnyFunction;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getUsage = (response: any): Usage => {
  const usage = response?.usage;
  return {
    prompt_tokens: Number(usage?.prompt_tokens ?? 0),
    completion_tokens: Number(usage?.completion_tokens ?? 0),
    total_tokens: Number(usage?.total_tokens ?? 0),
  };
};

const getTags = (options: TrackOptions): TrackTags => ({
  feature: options.feature,
  tenant_id: options.tenant_id,
  customer_id: options.customer_id,
  plan: options.plan,
  environment: options.environment,
  template_id: options.template_id,
});

const buildEvent = (
  endpoint: OpenAITrackEvent["endpoint"],
  latencyMs: number,
  response: any,
  tags: TrackTags,
  status: OpenAITrackEvent["status"],
  error?: Error
): OpenAITrackEvent => ({
  schema_version: "2026-02-16",
  event_type: "openai.request",
  provider: "openai",
  endpoint,
  status,
  timestamp: new Date().toISOString(),
  latency_ms: latencyMs,
  model: response?.model,
  usage: getUsage(response),
  tags,
  error:
    status === "failure"
      ? {
          type: error?.name,
          message: error?.message,
        }
      : undefined,
});

const sendWithRetry = async (event: OpenAITrackEvent, options: TrackOptions) => {
  const url = options.ingest_url ?? options.ingestUrl ?? process.env.TOKVERA_INGEST_URL;
  if (!url) return;

  const apiKey = options.api_key ?? options.apiKey ?? process.env.TOKVERA_API_KEY;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const payload = JSON.stringify(event);

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: "POST",
        headers,
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
  options: TrackOptions
) => {
  return async (...args: any[]) => {
    const start = Date.now();
    try {
      const response = await originalCreate(...args);
      const latencyMs = Date.now() - start;
      const event = buildEvent(endpoint, latencyMs, response, getTags(options), "success");
      void sendWithRetry(event, options);
      return response;
    } catch (error) {
      const latencyMs = Date.now() - start;
      const event = buildEvent(
        endpoint,
        latencyMs,
        undefined,
        getTags(options),
        "failure",
        error as Error
      );
      void sendWithRetry(event, options);
      throw error;
    }
  };
};

export const trackOpenAI = <T extends OpenAIClientShape>(
  openaiClient: T,
  options: TrackOptions = {}
): T => {
  const wrapper = Object.create(openaiClient) as T;

  const chatCreate = openaiClient.chat.completions.create.bind(openaiClient.chat.completions);
  const responsesCreate = openaiClient.responses.create.bind(openaiClient.responses);

  wrapper.chat = {
    ...openaiClient.chat,
    completions: {
      ...openaiClient.chat.completions,
      create: wrapCreate(chatCreate, "chat.completions.create", options),
    },
  } as T["chat"];

  wrapper.responses = {
    ...openaiClient.responses,
    create: wrapCreate(responsesCreate, "responses.create", options),
  } as T["responses"];

  return wrapper;
};

export type { OpenAITrackEvent, TrackOptions, TrackTags, Usage } from "./types.js";
