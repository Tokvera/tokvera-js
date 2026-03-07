import crypto from "node:crypto";
import {
  type AnthropicTrackEvent,
  type GeminiTrackEvent,
  type OpenAITrackEvent,
  type TrackEvent,
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

type AnthropicClientShape = {
  messages: {
    create: AnyFunction;
  };
};

type GeminiClientShape = {
  models: {
    generateContent?: AnyFunction;
    generate_content?: AnyFunction;
  };
};

type EventContract = {
  provider: TrackEvent["provider"];
  event_type: TrackEvent["event_type"];
  endpoint: TrackEvent["endpoint"];
  usageFromResponse: (response: any) => Usage;
  modelFromResponse?: (response: any) => string | undefined;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toNonNegativeInt = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const toTagValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const generateTraceId = () => `trc_${crypto.randomUUID().replace(/-/g, "")}`;
const generateSpanId = () => `spn_${crypto.randomUUID().replace(/-/g, "")}`;

const getOpenAIUsage = (response: any): Usage => {
  const usage = response?.usage;
  return {
    prompt_tokens: toNonNegativeInt(usage?.prompt_tokens),
    completion_tokens: toNonNegativeInt(usage?.completion_tokens),
    total_tokens: toNonNegativeInt(usage?.total_tokens),
  };
};

const getAnthropicUsage = (response: any): Usage => {
  const usage = response?.usage;
  const promptTokens = toNonNegativeInt(usage?.input_tokens ?? usage?.prompt_tokens);
  const completionTokens = toNonNegativeInt(usage?.output_tokens ?? usage?.completion_tokens);
  const totalTokens = toNonNegativeInt(usage?.total_tokens ?? promptTokens + completionTokens);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
};

const getGeminiUsage = (response: any): Usage => {
  const usage = response?.usageMetadata ?? response?.usage_metadata ?? {};
  const promptTokens = toNonNegativeInt(usage?.promptTokenCount ?? usage?.prompt_token_count);
  const completionTokens = toNonNegativeInt(
    usage?.candidatesTokenCount ?? usage?.candidates_token_count ?? usage?.completion_token_count
  );
  const totalTokens = toNonNegativeInt(usage?.totalTokenCount ?? usage?.total_token_count ?? promptTokens + completionTokens);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
};

const getTags = (options: TrackOptions): TrackTags => ({
  feature: toTagValue(options.feature),
  tenant_id: toTagValue(options.tenant_id),
  customer_id: toTagValue(options.customer_id),
  attempt_type: toTagValue(options.attempt_type),
  plan: toTagValue(options.plan),
  environment: toTagValue(options.environment),
  template_id: toTagValue(options.template_id),
  trace_id: toTagValue(options.trace_id) ?? generateTraceId(),
  run_id: toTagValue(options.run_id),
  conversation_id: toTagValue(options.conversation_id),
  span_id: toTagValue(options.span_id) ?? generateSpanId(),
  parent_span_id: toTagValue(options.parent_span_id),
  step_name: toTagValue(options.step_name),
});

const extractModelFromArgs = (args: any[]): string | undefined => {
  const first = args[0];
  if (first && typeof first === "object" && typeof first.model === "string" && first.model.length > 0) {
    return first.model;
  }
  return undefined;
};

const buildEvent = (
  contract: EventContract,
  latencyMs: number,
  response: any,
  modelHint: string | undefined,
  tags: TrackTags,
  status: TrackEvent["status"],
  error?: Error
): TrackEvent => ({
  schema_version: "2026-02-16",
  event_type: contract.event_type,
  provider: contract.provider,
  endpoint: contract.endpoint,
  status,
  timestamp: new Date().toISOString(),
  latency_ms: latencyMs,
  model: contract.modelFromResponse?.(response) ?? modelHint,
  usage: contract.usageFromResponse(response),
  tags,
  error:
    status === "failure"
      ? {
          type: error?.name,
          message: error?.message,
        }
      : undefined,
} as TrackEvent);

const sendWithRetry = async (event: TrackEvent, options: TrackOptions) => {
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
  contract: EventContract,
  options: TrackOptions
) => {
  return async (...args: any[]) => {
    const start = Date.now();
    const modelHint = extractModelFromArgs(args);
    try {
      const response = await originalCreate(...args);
      const latencyMs = Date.now() - start;
      const event = buildEvent(contract, latencyMs, response, modelHint, getTags(options), "success");
      void sendWithRetry(event, options);
      return response;
    } catch (error) {
      const latencyMs = Date.now() - start;
      const event = buildEvent(
        contract,
        latencyMs,
        undefined,
        modelHint,
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
      create: wrapCreate(
        chatCreate,
        {
          provider: "openai",
          event_type: "openai.request",
          endpoint: "chat.completions.create",
          usageFromResponse: getOpenAIUsage,
          modelFromResponse: (response) => response?.model,
        },
        options
      ),
    },
  } as T["chat"];

  wrapper.responses = {
    ...openaiClient.responses,
    create: wrapCreate(
      responsesCreate,
      {
        provider: "openai",
        event_type: "openai.request",
        endpoint: "responses.create",
        usageFromResponse: getOpenAIUsage,
        modelFromResponse: (response) => response?.model,
      },
      options
    ),
  } as T["responses"];

  return wrapper;
};

export const trackAnthropic = <T extends AnthropicClientShape>(
  anthropicClient: T,
  options: TrackOptions = {}
): T => {
  const wrapper = Object.create(anthropicClient) as T;
  const messagesCreate = anthropicClient.messages.create.bind(anthropicClient.messages);

  wrapper.messages = {
    ...anthropicClient.messages,
    create: wrapCreate(
      messagesCreate,
      {
        provider: "anthropic",
        event_type: "anthropic.request",
        endpoint: "messages.create",
        usageFromResponse: getAnthropicUsage,
        modelFromResponse: (response) => response?.model,
      },
      options
    ),
  } as T["messages"];

  return wrapper;
};

export const trackGemini = <T extends GeminiClientShape>(
  geminiClient: T,
  options: TrackOptions = {}
): T => {
  const wrapper = Object.create(geminiClient) as T;
  const models = geminiClient.models || ({} as T["models"]);

  const nextModels = {
    ...models,
  } as GeminiClientShape["models"];

  const contract: EventContract = {
    provider: "gemini",
    event_type: "gemini.request",
    endpoint: "models.generate_content",
    usageFromResponse: getGeminiUsage,
    modelFromResponse: (response) =>
      response?.model ?? response?.modelVersion ?? response?.model_version,
  };

  if (typeof models.generateContent === "function") {
    nextModels.generateContent = wrapCreate(models.generateContent.bind(models), contract, options);
  }

  if (typeof models.generate_content === "function") {
    nextModels.generate_content = wrapCreate(models.generate_content.bind(models), contract, options);
  }

  if (!nextModels.generateContent && !nextModels.generate_content) {
    throw new Error("Gemini client must expose models.generateContent or models.generate_content.");
  }

  wrapper.models = nextModels as T["models"];
  return wrapper;
};

export type {
  AnthropicTrackEvent,
  GeminiTrackEvent,
  OpenAITrackEvent,
  TrackEvent,
  TrackOptions,
  TrackTags,
  Usage,
} from "./types.js";
