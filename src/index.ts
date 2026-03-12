import crypto from "node:crypto";
import {
  type AnthropicTrackEvent,
  type BackgroundJobContext,
  type BackgroundJobContextOptions,
  type ExpressLikeNext,
  type ExpressLikeRequest,
  type ExpressLikeResponse,
  type ExpressMiddlewareOptions,
  type ExpressValueResolver,
  type LangChainCallbackOptions,
  type LangChainLLMResult,
  type LangChainSerialized,
  type GeminiTrackEvent,
  type OpenAITrackEvent,
  type TrackEvaluation,
  type TrackEvent,
  type TrackOptions,
  type TrackTags,
  type TraceDecision,
  type TraceMetrics,
  type TracePayloadBlock,
  type Usage,
  type VercelAICallParams,
  type VercelAIResult,
  type VercelAITrackOptions,
  type VercelAIUsage,
  type NextLikeRequest,
  type NextRouteContextOptions,
  type NestExecutionContextLike,
  type BullMQJobLike,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_ERROR_BODY_LENGTH = 256;
const TRACE_SCHEMA_VERSION_V1 = "2026-02-16";
const TRACE_SCHEMA_VERSION_V2 = "2026-04-01";

const ALLOWED_SPAN_KINDS = new Set(["model", "tool", "orchestrator", "retrieval", "guardrail"]);
const ALLOWED_TRACE_PAYLOAD_TYPES = new Set([
  "prompt_input",
  "tool_input",
  "tool_output",
  "model_output",
  "context",
  "other",
]);

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

type IngestResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status?: number;
      message: string;
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

const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toSchemaVersion = (
  value: unknown
): "2026-02-16" | "2026-04-01" | undefined => {
  if (value === TRACE_SCHEMA_VERSION_V1 || value === TRACE_SCHEMA_VERSION_V2) {
    return value;
  }
  return undefined;
};

const toSpanKind = (value: unknown): TrackEvent["span_kind"] | undefined => {
  const normalized = toTagValue(value);
  if (!normalized) return undefined;
  return ALLOWED_SPAN_KINDS.has(normalized) ? (normalized as TrackEvent["span_kind"]) : undefined;
};

const toTracePayloadType = (value: unknown): TracePayloadBlock["payload_type"] => {
  const normalized = toTagValue(value);
  if (!normalized) return "other";
  if (normalized === "prompt") return "prompt_input";
  return ALLOWED_TRACE_PAYLOAD_TYPES.has(normalized)
    ? (normalized as TracePayloadBlock["payload_type"])
    : "other";
};

const normalizeTracePayloadBlocks = (value: unknown): TracePayloadBlock[] => {
  if (!Array.isArray(value)) return [];
  const blocks: TracePayloadBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const payloadType = toTracePayloadType(
      (item as Record<string, unknown>).payload_type ?? (item as Record<string, unknown>).payloadType
    );
    const content = String((item as Record<string, unknown>).content ?? "").trim();
    if (!content) continue;
    blocks.push({
      payload_type: payloadType,
      content,
    });
  }
  return blocks;
};

const normalizeTraceMetrics = (value: unknown): TraceMetrics | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const metrics: TraceMetrics = {};
  const promptTokens = toOptionalFiniteNumber(source.prompt_tokens);
  const completionTokens = toOptionalFiniteNumber(source.completion_tokens);
  const totalTokens = toOptionalFiniteNumber(source.total_tokens);
  const costUsd =
    toOptionalFiniteNumber(source.cost_usd) ??
    toOptionalFiniteNumber(source.estimated_cost_usd);
  const latencyMs = toOptionalFiniteNumber(source.latency_ms);
  if (promptTokens !== undefined) metrics.prompt_tokens = promptTokens;
  if (completionTokens !== undefined) metrics.completion_tokens = completionTokens;
  if (totalTokens !== undefined) metrics.total_tokens = totalTokens;
  if (costUsd !== undefined) metrics.cost_usd = costUsd;
  if (latencyMs !== undefined) metrics.latency_ms = latencyMs;
  return Object.keys(metrics).length > 0 ? metrics : undefined;
};

const normalizeTraceDecision = (value: unknown): TraceDecision | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const decision: TraceDecision = {
    retry_reason: toTagValue(source.retry_reason),
    fallback_reason: toTagValue(source.fallback_reason),
    routing_reason: toTagValue(source.routing_reason),
    route: toTagValue(source.route),
  };
  if (
    decision.retry_reason === undefined &&
    decision.fallback_reason === undefined &&
    decision.routing_reason === undefined &&
    decision.route === undefined
  ) {
    return undefined;
  }
  return decision;
};

const normalizePayloadRefs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toTagValue(item))
    .filter((item): item is string => Boolean(item));
};

const hashContent = (content: string | undefined): string | undefined => {
  const normalized = typeof content === "string" ? content.trim() : "";
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
};

const generateTraceId = () => `trc_${crypto.randomUUID().replace(/-/g, "")}`;
const generateRunId = () => `run_${crypto.randomUUID().replace(/-/g, "")}`;
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

const getTags = (options: TrackOptions): TrackTags => {
  const feedbackScore = toOptionalFiniteNumber(options.feedback_score);
  return {
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
    outcome: toTagValue(options.outcome),
    retry_reason: toTagValue(options.retry_reason),
    fallback_reason: toTagValue(options.fallback_reason),
    quality_label: toTagValue(options.quality_label),
    feedback_score: feedbackScore !== undefined ? String(feedbackScore) : undefined,
  };
};

const getEvaluation = (options: TrackOptions): TrackEvaluation | undefined => {
  const evaluation: TrackEvaluation = {
    outcome: toTagValue(options.outcome),
    retry_reason: toTagValue(options.retry_reason),
    fallback_reason: toTagValue(options.fallback_reason),
    quality_label: toTagValue(options.quality_label),
    feedback_score: toOptionalFiniteNumber(options.feedback_score),
  };

  if (
    evaluation.outcome === undefined &&
    evaluation.retry_reason === undefined &&
    evaluation.fallback_reason === undefined &&
    evaluation.quality_label === undefined &&
    evaluation.feedback_score === undefined
  ) {
    return undefined;
  }

  return evaluation;
};

const readHeaderValue = (request: ExpressLikeRequest, headerName: string): string | undefined => {
  if (!request || !request.headers) return undefined;
  const headers = request.headers;
  const lowerHeaderName = headerName.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerHeaderName) continue;
    if (Array.isArray(value)) return toTagValue(value[0]);
    return toTagValue(value);
  }

  return undefined;
};

const readNextHeaderValue = (request: NextLikeRequest, headerName: string): string | undefined => {
  const headers = request?.headers;
  if (!headers) return undefined;
  const getter = (headers as { get?: (name: string) => string | null | undefined }).get;
  if (typeof getter === "function") {
    return toTagValue(getter(headerName));
  }
  const lowerHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerHeaderName) continue;
    if (Array.isArray(value)) return toTagValue(value[0]);
    return toTagValue(value);
  }
  return undefined;
};

const resolveRequestValue = <T>(
  resolver: ExpressValueResolver<T> | undefined,
  request: ExpressLikeRequest
): T | undefined => {
  if (resolver === undefined) return undefined;
  if (typeof resolver === "function") {
    const resolved = (resolver as (request: ExpressLikeRequest) => T | undefined | null)(request);
    return resolved ?? undefined;
  }
  return resolver;
};

const resolveRequestTag = (
  resolver: ExpressValueResolver<string> | undefined,
  request: ExpressLikeRequest
): string | undefined => {
  const resolved = resolveRequestValue(resolver, request);
  return toTagValue(resolved);
};

const resolveRequestFeedbackScore = (
  resolver: ExpressValueResolver<number | string> | undefined,
  request: ExpressLikeRequest
): number | undefined => {
  const resolved = resolveRequestValue(resolver, request);
  return toOptionalFiniteNumber(resolved);
};

const deriveRequestStepName = (request: ExpressLikeRequest): string | undefined => {
  const path =
    toTagValue(request.path) ??
    toTagValue(request.originalUrl) ??
    toTagValue(request.url);
  if (!path) return undefined;

  const method = toTagValue(request.method)?.toLowerCase();
  return method ? `${method} ${path}` : path;
};

const withDefinedTrackOptions = <T extends Record<string, unknown>>(options: T): T => {
  const normalized = {} as T;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    (normalized as Record<string, unknown>)[key] = value;
  }
  return normalized;
};

export const createTokveraExpressMiddleware = (
  options: ExpressMiddlewareOptions = {}
) => {
  const traceHeaderName = toTagValue(options.traceHeaderName) ?? "x-tokvera-trace-id";
  const runHeaderName = toTagValue(options.runHeaderName) ?? "x-tokvera-run-id";
  const conversationHeaderName =
    toTagValue(options.conversationHeaderName) ?? "x-tokvera-conversation-id";
  const responseTraceHeaderName =
    toTagValue(options.responseTraceHeaderName) ?? traceHeaderName;

  return (request: ExpressLikeRequest, response: ExpressLikeResponse, next: ExpressLikeNext) => {
    const traceId = readHeaderValue(request, traceHeaderName) ?? generateTraceId();
    const runId = resolveRequestTag(options.run_id, request) ?? readHeaderValue(request, runHeaderName);
    const conversationId =
      resolveRequestTag(options.conversation_id, request) ??
      readHeaderValue(request, conversationHeaderName);
    const feedbackScore = resolveRequestFeedbackScore(options.feedback_score, request);

    const requestContext = withDefinedTrackOptions({
      feature: resolveRequestTag(options.feature, request),
      tenant_id: resolveRequestTag(options.tenant_id, request),
      customer_id: resolveRequestTag(options.customer_id, request),
      attempt_type: resolveRequestTag(options.attempt_type, request),
      plan: resolveRequestTag(options.plan, request),
      environment: resolveRequestTag(options.environment, request),
      template_id: resolveRequestTag(options.template_id, request),
      trace_id: traceId,
      run_id: runId,
      conversation_id: conversationId,
      span_id: generateSpanId(),
      parent_span_id: resolveRequestTag(options.parent_span_id, request),
      step_name: resolveRequestTag(options.step_name, request) ?? deriveRequestStepName(request),
      outcome: resolveRequestTag(options.outcome, request),
      retry_reason: resolveRequestTag(options.retry_reason, request),
      fallback_reason: resolveRequestTag(options.fallback_reason, request),
      quality_label: resolveRequestTag(options.quality_label, request),
      feedback_score: feedbackScore,
    });

    request.tokvera = requestContext;

    if (response && typeof response.setHeader === "function") {
      response.setHeader(responseTraceHeaderName, traceId);
    }

    if (response) {
      const locals =
        response.locals && typeof response.locals === "object"
          ? response.locals
          : {};
      (locals as Record<string, unknown>).tokvera = requestContext;
      response.locals = locals;
    }

    next();
  };
};

export const getTrackOptionsFromExpressRequest = (
  request: ExpressLikeRequest,
  overrides: TrackOptions = {}
): TrackOptions => {
  const requestContext = request?.tokvera ?? {};
  const traceId =
    toTagValue(overrides.trace_id) ??
    toTagValue(requestContext.trace_id) ??
    readHeaderValue(request, "x-tokvera-trace-id") ??
    generateTraceId();

  const requestSpanId = toTagValue(requestContext.span_id);
  const parentSpanId =
    toTagValue(overrides.parent_span_id) ??
    toTagValue(requestContext.parent_span_id) ??
    requestSpanId;

  const merged = withDefinedTrackOptions({
    ...requestContext,
    ...overrides,
    trace_id: traceId,
    span_id: toTagValue(overrides.span_id) ?? generateSpanId(),
    parent_span_id: parentSpanId,
  });

  return merged;
};

export const createTokveraNextRouteContext = (
  request: NextLikeRequest,
  options: NextRouteContextOptions = {}
): TrackOptions => {
  const traceHeaderName = toTagValue(options.traceHeaderName) ?? "x-tokvera-trace-id";
  const runHeaderName = toTagValue(options.runHeaderName) ?? "x-tokvera-run-id";
  const conversationHeaderName =
    toTagValue(options.conversationHeaderName) ?? "x-tokvera-conversation-id";

  const method = toTagValue(request?.method);
  const nextPath =
    toTagValue(request?.nextUrl?.pathname) ??
    toTagValue(request?.pathname) ??
    (() => {
      const rawUrl = toTagValue(request?.url);
      if (!rawUrl) return undefined;
      try {
        return new URL(rawUrl).pathname;
      } catch {
        return rawUrl;
      }
    })();

  const expressLikeRequest: ExpressLikeRequest = {
    ...(request as Record<string, unknown>),
    method,
    path: nextPath,
    headers: request?.headers as unknown as Record<string, string | string[] | undefined>,
  };

  const traceId = readNextHeaderValue(request, traceHeaderName) ?? generateTraceId();
  const runId = resolveRequestTag(options.run_id, expressLikeRequest) ?? readNextHeaderValue(request, runHeaderName);
  const conversationId =
    resolveRequestTag(options.conversation_id, expressLikeRequest) ??
    readNextHeaderValue(request, conversationHeaderName);
  const feedbackScore = resolveRequestFeedbackScore(options.feedback_score, expressLikeRequest);

  const requestContext = withDefinedTrackOptions({
    feature: resolveRequestTag(options.feature, expressLikeRequest),
    tenant_id: resolveRequestTag(options.tenant_id, expressLikeRequest),
    customer_id: resolveRequestTag(options.customer_id, expressLikeRequest),
    attempt_type: resolveRequestTag(options.attempt_type, expressLikeRequest),
    plan: resolveRequestTag(options.plan, expressLikeRequest),
    environment: resolveRequestTag(options.environment, expressLikeRequest),
    template_id: resolveRequestTag(options.template_id, expressLikeRequest),
    trace_id: traceId,
    run_id: runId,
    conversation_id: conversationId,
    span_id: generateSpanId(),
    parent_span_id: resolveRequestTag(options.parent_span_id, expressLikeRequest),
    step_name: resolveRequestTag(options.step_name, expressLikeRequest) ?? deriveRequestStepName(expressLikeRequest),
    outcome: resolveRequestTag(options.outcome, expressLikeRequest),
    retry_reason: resolveRequestTag(options.retry_reason, expressLikeRequest),
    fallback_reason: resolveRequestTag(options.fallback_reason, expressLikeRequest),
    quality_label: resolveRequestTag(options.quality_label, expressLikeRequest),
    feedback_score: feedbackScore,
  });

  request.tokvera = requestContext;
  return requestContext;
};

export const getTrackOptionsFromNextRouteContext = (
  request: NextLikeRequest,
  overrides: TrackOptions = {}
): TrackOptions => {
  const expressLikeRequest: ExpressLikeRequest = {
    ...request,
    headers: request?.headers as Record<string, string | string[] | undefined>,
  };
  return getTrackOptionsFromExpressRequest(expressLikeRequest, overrides);
};

export const createTokveraNestMiddleware = (
  options: ExpressMiddlewareOptions = {}
) => createTokveraExpressMiddleware(options);

export const getTrackOptionsFromNestRequest = (
  request: ExpressLikeRequest,
  overrides: TrackOptions = {}
): TrackOptions => getTrackOptionsFromExpressRequest(request, overrides);

export const getTrackOptionsFromNestExecutionContext = (
  context: NestExecutionContextLike,
  overrides: TrackOptions = {}
): TrackOptions => {
  const request = context?.switchToHttp?.()?.getRequest?.();
  if (!request) {
    return withDefinedTrackOptions({
      ...overrides,
      trace_id: toTagValue(overrides.trace_id) ?? generateTraceId(),
      span_id: toTagValue(overrides.span_id) ?? generateSpanId(),
    });
  }
  return getTrackOptionsFromExpressRequest(request, overrides);
};

export const createTokveraBackgroundJobContext = (
  options: BackgroundJobContextOptions = {}
): BackgroundJobContext => {
  const traceId = toTagValue(options.trace_id) ?? generateTraceId();
  const runId = toTagValue(options.run_id) ?? generateRunId();
  const rootSpanId =
    toTagValue(options.root_span_id) ??
    toTagValue(options.span_id) ??
    generateSpanId();

  const baseTrackOptions = withDefinedTrackOptions({
    ...options,
    trace_id: traceId,
    run_id: runId,
    span_id: rootSpanId,
    parent_span_id: toTagValue(options.parent_span_id),
    conversation_id: toTagValue(options.conversation_id),
  });

  return {
    job_id: toTagValue(options.job_id),
    trace_id: traceId,
    run_id: runId,
    conversation_id: toTagValue(options.conversation_id),
    root_span_id: rootSpanId,
    base_track_options: baseTrackOptions,
  };
};

export const getTrackOptionsFromBackgroundJobContext = (
  context: BackgroundJobContext,
  overrides: TrackOptions = {}
): TrackOptions => {
  const traceId =
    toTagValue(overrides.trace_id) ??
    toTagValue(context.trace_id) ??
    toTagValue(context.base_track_options?.trace_id) ??
    generateTraceId();

  const runId =
    toTagValue(overrides.run_id) ??
    toTagValue(context.run_id) ??
    toTagValue(context.base_track_options?.run_id) ??
    generateRunId();

  const parentSpanId =
    toTagValue(overrides.parent_span_id) ??
    toTagValue(context.root_span_id) ??
    toTagValue(context.base_track_options?.span_id);

  return withDefinedTrackOptions({
    ...context.base_track_options,
    ...overrides,
    trace_id: traceId,
    run_id: runId,
    conversation_id:
      toTagValue(overrides.conversation_id) ??
      toTagValue(context.conversation_id) ??
      toTagValue(context.base_track_options?.conversation_id),
    span_id: toTagValue(overrides.span_id) ?? generateSpanId(),
    parent_span_id: parentSpanId,
  });
};

export const createTokveraBullMQJobContext = (
  job: BullMQJobLike,
  options: BackgroundJobContextOptions = {}
): BackgroundJobContext => {
  const jobId = toTagValue(job?.id) ?? toTagValue(options.job_id);
  const attemptsMade = toOptionalFiniteNumber(job?.attemptsMade);
  const configuredAttempts = toOptionalFiniteNumber(job?.opts?.attempts);
  const queueName = toTagValue(job?.queueName);
  const jobName = toTagValue(job?.name);

  const context = createTokveraBackgroundJobContext({
    ...options,
    job_id: jobId,
    feature:
      toTagValue(options.feature) ??
      jobName ??
      queueName,
    attempt_type:
      toTagValue(options.attempt_type) ??
      (attemptsMade !== undefined && attemptsMade > 0 ? "retry" : "initial"),
    template_id:
      toTagValue(options.template_id) ??
      (configuredAttempts !== undefined ? `attempts_${Math.trunc(configuredAttempts)}` : undefined),
  });

  return context;
};

export const getTrackOptionsFromBullMQJobContext = (
  context: BackgroundJobContext,
  overrides: TrackOptions = {}
): TrackOptions => getTrackOptionsFromBackgroundJobContext(context, overrides);

type ProviderContract = {
  provider: TrackEvent["provider"];
  event_type: TrackEvent["event_type"];
  endpoint: TrackEvent["endpoint"];
};

type LangChainRunSnapshot = {
  startedAt: number;
  contract: ProviderContract;
  model?: string;
  tags: TrackTags;
  evaluation?: TrackEvaluation;
  promptContent?: string;
};

const sanitizeIdComponent = (value: unknown): string => {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);
  return normalized;
};

const createDerivedId = (prefix: "trc" | "spn", source?: unknown): string => {
  const sanitized = sanitizeIdComponent(source);
  if (!sanitized) {
    return prefix === "trc" ? generateTraceId() : generateSpanId();
  }
  return `${prefix}_${sanitized.toLowerCase()}`;
};

const readObjectValue = (source: unknown, key: string): unknown => {
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
};

const readTagFromObject = (source: unknown, key: string): string | undefined =>
  toTagValue(readObjectValue(source, key));

const readNumberFromObject = (source: unknown, key: string): number | undefined =>
  toOptionalFiniteNumber(readObjectValue(source, key));

const inferProviderFromModel = (model: string | undefined): TrackEvent["provider"] => {
  const normalized = (model ?? "").toLowerCase();
  if (normalized.includes("claude")) return "anthropic";
  if (normalized.includes("gemini")) return "gemini";
  return "openai";
};

const contractFromProvider = (
  provider: TrackEvent["provider"],
  endpointOverride?: TrackEvent["endpoint"]
): ProviderContract => {
  if (provider === "anthropic") {
    return {
      provider: "anthropic",
      event_type: "anthropic.request",
      endpoint: endpointOverride ?? "messages.create",
    };
  }

  if (provider === "gemini") {
    return {
      provider: "gemini",
      event_type: "gemini.request",
      endpoint: endpointOverride ?? "models.generate_content",
    };
  }

  return {
    provider: "openai",
    event_type: "openai.request",
    endpoint: endpointOverride ?? "chat.completions.create",
  };
};

const inferModelFromLangChainStart = (
  serialized: LangChainSerialized | undefined,
  extraParams: Record<string, unknown> | undefined
): string | undefined => {
  const serializedModel =
    readTagFromObject(serialized?.kwargs, "model") ??
    readTagFromObject(serialized?.kwargs, "modelName") ??
    readTagFromObject(serialized?.kwargs, "model_name");
  if (serializedModel) return serializedModel;

  const invocationParams =
    (readObjectValue(extraParams, "invocation_params") as Record<string, unknown> | undefined) ??
    (readObjectValue(extraParams, "invocationParams") as Record<string, unknown> | undefined);
  const invocationModel =
    readTagFromObject(invocationParams, "model") ??
    readTagFromObject(invocationParams, "modelName") ??
    readTagFromObject(invocationParams, "model_name");
  if (invocationModel) return invocationModel;

  return undefined;
};

const extractLangChainUsage = (result: LangChainLLMResult | undefined): Usage => {
  const llmOutput =
    (result?.llmOutput as Record<string, unknown> | undefined) ??
    (result?.llm_output as Record<string, unknown> | undefined) ??
    {};
  const tokenUsage =
    (readObjectValue(llmOutput, "tokenUsage") as Record<string, unknown> | undefined) ??
    (readObjectValue(llmOutput, "token_usage") as Record<string, unknown> | undefined) ??
    {};
  const usageObject =
    (readObjectValue(llmOutput, "usage") as Record<string, unknown> | undefined) ??
    {};
  const usageMetadata =
    (readObjectValue(llmOutput, "usageMetadata") as Record<string, unknown> | undefined) ??
    (readObjectValue(llmOutput, "usage_metadata") as Record<string, unknown> | undefined) ??
    {};

  const promptTokens =
    readNumberFromObject(tokenUsage, "promptTokens") ??
    readNumberFromObject(tokenUsage, "prompt_tokens") ??
    readNumberFromObject(tokenUsage, "input_tokens") ??
    readNumberFromObject(usageObject, "prompt_tokens") ??
    readNumberFromObject(usageObject, "input_tokens") ??
    readNumberFromObject(usageMetadata, "promptTokenCount") ??
    readNumberFromObject(usageMetadata, "prompt_token_count") ??
    readNumberFromObject(llmOutput, "promptTokens") ??
    readNumberFromObject(llmOutput, "prompt_tokens") ??
    0;

  const completionTokens =
    readNumberFromObject(tokenUsage, "completionTokens") ??
    readNumberFromObject(tokenUsage, "completion_tokens") ??
    readNumberFromObject(tokenUsage, "output_tokens") ??
    readNumberFromObject(usageObject, "completion_tokens") ??
    readNumberFromObject(usageObject, "output_tokens") ??
    readNumberFromObject(usageMetadata, "candidatesTokenCount") ??
    readNumberFromObject(usageMetadata, "candidates_token_count") ??
    readNumberFromObject(llmOutput, "completionTokens") ??
    readNumberFromObject(llmOutput, "completion_tokens") ??
    0;

  const totalTokens =
    readNumberFromObject(tokenUsage, "totalTokens") ??
    readNumberFromObject(tokenUsage, "total_tokens") ??
    readNumberFromObject(usageObject, "total_tokens") ??
    readNumberFromObject(usageMetadata, "totalTokenCount") ??
    readNumberFromObject(usageMetadata, "total_token_count") ??
    readNumberFromObject(llmOutput, "totalTokens") ??
    readNumberFromObject(llmOutput, "total_tokens") ??
    promptTokens + completionTokens;

  return {
    prompt_tokens: toNonNegativeInt(promptTokens),
    completion_tokens: toNonNegativeInt(completionTokens),
    total_tokens: toNonNegativeInt(totalTokens),
  };
};

const extractLangChainResponseText = (result: LangChainLLMResult | undefined): string | undefined => {
  if (!result) return undefined;
  const generations = Array.isArray(result.generations) ? result.generations : [];
  const parts: string[] = [];
  for (const generationGroup of generations) {
    const group = Array.isArray(generationGroup) ? generationGroup : [generationGroup];
    for (const generation of group) {
      if (!generation || typeof generation !== "object") continue;
      const directText = toTagValue((generation as Record<string, unknown>).text);
      if (directText) {
        parts.push(directText);
        continue;
      }
      const message = (generation as Record<string, unknown>).message;
      const messageContent = toTagValue(
        message && typeof message === "object"
          ? (message as Record<string, unknown>).content
          : undefined
      );
      if (messageContent) parts.push(messageContent);
    }
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n");
};

const deriveLangChainSnapshot = (
  options: LangChainCallbackOptions,
  serialized: LangChainSerialized | undefined,
  prompts: string[] | undefined,
  runId: string,
  parentRunId: string | undefined,
  extraParams: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined,
  runName: string | undefined,
  parentSnapshot: LangChainRunSnapshot | undefined
): LangChainRunSnapshot => {
  const model =
    toTagValue(options.model) ??
    readTagFromObject(metadata, "model") ??
    inferModelFromLangChainStart(serialized, extraParams);
  const provider =
    toTagValue(options.provider) as TrackEvent["provider"] | undefined ??
    (readTagFromObject(metadata, "provider") as TrackEvent["provider"] | undefined) ??
    inferProviderFromModel(model);
  const contract = contractFromProvider(
    provider,
    toTagValue(options.endpoint) as TrackEvent["endpoint"] | undefined
  );

  const feedbackScore =
    toOptionalFiniteNumber(options.feedback_score) ??
    readNumberFromObject(metadata, "feedback_score");
  const runScopedTraceId =
    options.runIdAsTraceId === true
      ? createDerivedId("trc", parentRunId ?? runId)
      : undefined;

  const mergedOptions = withDefinedTrackOptions({
    ...options,
    feature: toTagValue(options.feature) ?? readTagFromObject(metadata, "feature"),
    tenant_id: toTagValue(options.tenant_id) ?? readTagFromObject(metadata, "tenant_id"),
    customer_id: toTagValue(options.customer_id) ?? readTagFromObject(metadata, "customer_id"),
    attempt_type: toTagValue(options.attempt_type) ?? readTagFromObject(metadata, "attempt_type"),
    plan: toTagValue(options.plan) ?? readTagFromObject(metadata, "plan"),
    environment: toTagValue(options.environment) ?? readTagFromObject(metadata, "environment"),
    template_id: toTagValue(options.template_id) ?? readTagFromObject(metadata, "template_id"),
    trace_id:
      toTagValue(options.trace_id) ??
      readTagFromObject(metadata, "trace_id") ??
      parentSnapshot?.tags.trace_id ??
      runScopedTraceId ??
      createDerivedId("trc", parentRunId ?? runId),
    run_id:
      toTagValue(options.run_id) ??
      readTagFromObject(metadata, "run_id") ??
      parentSnapshot?.tags.run_id ??
      toTagValue(runId),
    conversation_id:
      toTagValue(options.conversation_id) ??
      readTagFromObject(metadata, "conversation_id") ??
      parentSnapshot?.tags.conversation_id,
    span_id:
      toTagValue(options.span_id) ??
      readTagFromObject(metadata, "span_id") ??
      createDerivedId("spn", runId),
    parent_span_id:
      toTagValue(options.parent_span_id) ??
      readTagFromObject(metadata, "parent_span_id") ??
      parentSnapshot?.tags.span_id ??
      (parentRunId ? createDerivedId("spn", parentRunId) : undefined),
    step_name:
      toTagValue(options.step_name) ??
      readTagFromObject(metadata, "step_name") ??
      toTagValue(runName) ??
      readTagFromObject(serialized?.kwargs, "name"),
    outcome: toTagValue(options.outcome) ?? readTagFromObject(metadata, "outcome"),
    retry_reason: toTagValue(options.retry_reason) ?? readTagFromObject(metadata, "retry_reason"),
    fallback_reason:
      toTagValue(options.fallback_reason) ?? readTagFromObject(metadata, "fallback_reason"),
    quality_label: toTagValue(options.quality_label) ?? readTagFromObject(metadata, "quality_label"),
    feedback_score: feedbackScore,
  });

  return {
    startedAt: Date.now(),
    contract,
    model,
    tags: getTags(mergedOptions),
    evaluation: getEvaluation(mergedOptions),
    promptContent: Array.isArray(prompts) && prompts.length > 0 ? toStableJson(prompts) : undefined,
  };
};

export class TokveraLangChainCallbackHandler {
  name = "tokvera_langchain_callback";

  private readonly options: LangChainCallbackOptions;
  private readonly runs = new Map<string, LangChainRunSnapshot>();

  constructor(options: LangChainCallbackOptions = {}) {
    this.options = options;
  }

  async handleLLMStart(
    serialized: LangChainSerialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    const runKey = String(runId);
    const parentKey = parentRunId ? String(parentRunId) : undefined;
    const parentSnapshot = parentKey ? this.runs.get(parentKey) : undefined;
    const snapshot = deriveLangChainSnapshot(
      this.options,
      serialized,
      prompts,
      runKey,
      parentKey,
      extraParams,
      metadata,
      runName,
      parentSnapshot
    );
    this.runs.set(runKey, snapshot);
  }

  async handleLLMEnd(
    output: LangChainLLMResult,
    runId: string
  ): Promise<void> {
    const runKey = String(runId);
    const snapshot =
      this.runs.get(runKey) ??
      deriveLangChainSnapshot(
        this.options,
        undefined,
        undefined,
        runKey,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
    this.runs.delete(runKey);

    const latencyMs = Math.max(0, Date.now() - snapshot.startedAt);
    const usage = extractLangChainUsage(output);
    const baseEvent = {
      schema_version: "2026-02-16",
      event_type: snapshot.contract.event_type,
      provider: snapshot.contract.provider,
      endpoint: snapshot.contract.endpoint,
      status: "success",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      model: snapshot.model,
      usage,
      tags: {
        ...snapshot.tags,
        outcome: snapshot.tags.outcome ?? "success",
      },
      evaluation:
        snapshot.evaluation || snapshot.tags.outcome || snapshot.tags.feedback_score
          ? {
              ...(snapshot.evaluation ?? {}),
              outcome: snapshot.evaluation?.outcome ?? snapshot.tags.outcome ?? "success",
            }
          : undefined,
    } as TrackEvent;
    const event = decorateEventWithTraceV2(baseEvent, {
      options: this.options,
      promptContent: snapshot.promptContent,
      responseContent: extractLangChainResponseText(output),
    });

    const ingestResult = await sendWithRetry(event, this.options);
    logIngestFailure(ingestResult);
  }

  async handleLLMError(
    error: Error,
    runId: string
  ): Promise<void> {
    const runKey = String(runId);
    const snapshot =
      this.runs.get(runKey) ??
      deriveLangChainSnapshot(
        this.options,
        undefined,
        undefined,
        runKey,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
    this.runs.delete(runKey);

    const latencyMs = Math.max(0, Date.now() - snapshot.startedAt);
    const baseEvent = {
      schema_version: "2026-02-16",
      event_type: snapshot.contract.event_type,
      provider: snapshot.contract.provider,
      endpoint: snapshot.contract.endpoint,
      status: "failure",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      model: snapshot.model,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      tags: {
        ...snapshot.tags,
        outcome: snapshot.tags.outcome ?? "failure",
      },
      evaluation:
        snapshot.evaluation || snapshot.tags.outcome || snapshot.tags.feedback_score
          ? {
              ...(snapshot.evaluation ?? {}),
              outcome: snapshot.evaluation?.outcome ?? snapshot.tags.outcome ?? "failure",
            }
          : undefined,
      error: {
        type: error?.name,
        message: error?.message,
      },
    } as TrackEvent;
    const event = decorateEventWithTraceV2(baseEvent, {
      options: this.options,
      promptContent: snapshot.promptContent,
    });

    const ingestResult = await sendWithRetry(event, this.options);
    logIngestFailure(ingestResult);
  }
}

export const createTokveraLangChainCallback = (
  options: LangChainCallbackOptions = {}
) => new TokveraLangChainCallbackHandler(options);

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
};

const readNumberField = (source: unknown, keys: string[]): number | undefined => {
  const record = toRecord(source);
  if (!record) return undefined;
  for (const key of keys) {
    const parsed = toOptionalFiniteNumber(record[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const inferModelFromVercelParams = (params: VercelAICallParams | undefined): string | undefined => {
  if (!params) return undefined;
  const modelValue = params.model;
  if (typeof modelValue === "string") return toTagValue(modelValue);
  const modelObject = toRecord(modelValue);
  if (!modelObject) return undefined;
  return (
    toTagValue(modelObject.modelId) ??
    toTagValue(modelObject.model_id) ??
    toTagValue(modelObject.id)
  );
};

const inferModelFromVercelResult = (result: VercelAIResult | undefined): string | undefined => {
  if (!result) return undefined;
  return (
    toTagValue(result.model) ??
    toTagValue(result.modelId) ??
    toTagValue(result.model_id)
  );
};

const extractUsageFromVercelResult = (result: VercelAIResult | undefined): Usage => {
  const usage = result?.usage as VercelAIUsage | undefined;
  const providerMetadata =
    toRecord(result?.providerMetadata) ??
    toRecord(result?.provider_metadata);
  const providerUsageCandidates = providerMetadata
    ? Object.values(providerMetadata)
        .map((item) => toRecord(item)?.usage ?? toRecord(item)?.tokenUsage ?? toRecord(item)?.token_usage)
        .filter(Boolean)
    : [];

  const usageSources: unknown[] = [
    usage,
    ...providerUsageCandidates,
  ];

  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;

  for (const source of usageSources) {
    promptTokens =
      promptTokens ??
      readNumberField(source, ["promptTokens", "prompt_tokens", "inputTokens", "input_tokens", "input_tokens"]);
    completionTokens =
      completionTokens ??
      readNumberField(source, [
        "completionTokens",
        "completion_tokens",
        "outputTokens",
        "output_tokens",
        "candidatesTokenCount",
        "candidates_token_count",
      ]);
    totalTokens =
      totalTokens ??
      readNumberField(source, ["totalTokens", "total_tokens", "totalTokenCount", "total_token_count"]);
  }

  const safePrompt = toNonNegativeInt(promptTokens ?? 0);
  const safeCompletion = toNonNegativeInt(completionTokens ?? 0);
  const safeTotal = toNonNegativeInt(totalTokens ?? safePrompt + safeCompletion);

  return {
    prompt_tokens: safePrompt,
    completion_tokens: safeCompletion,
    total_tokens: safeTotal,
  };
};

const extractPromptFromVercelParams = (params: VercelAICallParams | undefined): string | undefined => {
  if (!params || typeof params !== "object") return undefined;
  const candidate =
    (params as Record<string, unknown>).messages ??
    (params as Record<string, unknown>).input ??
    (params as Record<string, unknown>).prompt ??
    (params as Record<string, unknown>).contents;
  if (candidate === undefined) return undefined;
  return toStableJson(candidate);
};

const extractResponseFromVercelResult = (result: VercelAIResult | undefined): string | undefined => {
  if (!result) return undefined;
  const text =
    toTagValue((result as Record<string, unknown>).text) ??
    toTagValue((result as Record<string, unknown>).output_text);
  if (text) return text;
  const response = (result as Record<string, unknown>).response;
  if (response && typeof response === "object") {
    return extractResponseContent(response);
  }
  return undefined;
};

const buildVercelEventContract = (
  options: VercelAITrackOptions,
  model: string | undefined
): ProviderContract => {
  const provider =
    (toTagValue(options.provider) as TrackEvent["provider"] | undefined) ??
    inferProviderFromModel(model);
  const endpointOverride = toTagValue(options.endpoint) as TrackEvent["endpoint"] | undefined;

  if (provider === "anthropic") {
    return {
      provider: "anthropic",
      event_type: "anthropic.request",
      endpoint: endpointOverride ?? "messages.create",
    };
  }

  if (provider === "gemini") {
    return {
      provider: "gemini",
      event_type: "gemini.request",
      endpoint: endpointOverride ?? "models.generate_content",
    };
  }

  return {
    provider: "openai",
    event_type: "openai.request",
    endpoint: endpointOverride ?? "responses.create",
  };
};

export const wrapVercelAIGenerateText = <
  TFn extends (params: VercelAICallParams) => Promise<VercelAIResult>
>(
  generateText: TFn,
  baseOptions: VercelAITrackOptions = {}
) => {
  return async (
    params: Parameters<TFn>[0],
    overrideOptions: Partial<VercelAITrackOptions> = {}
  ): Promise<Awaited<ReturnType<TFn>>> => {
    const start = Date.now();
    const mergedOptions = withDefinedTrackOptions({
      ...baseOptions,
      ...overrideOptions,
    });
    const tags = getTags(mergedOptions);
    const evaluation = getEvaluation(mergedOptions);
    const promptContent = extractPromptFromVercelParams(params);

    const modelHint =
      toTagValue(mergedOptions.model) ??
      inferModelFromVercelParams(params);
    const contract = buildVercelEventContract(mergedOptions, modelHint);

    try {
      const result = await generateText(params);
      const latencyMs = Date.now() - start;
      const model = modelHint ?? inferModelFromVercelResult(result);
      const baseEvent = {
        schema_version: "2026-02-16",
        event_type: contract.event_type,
        provider: contract.provider,
        endpoint: contract.endpoint,
        status: "success",
        timestamp: new Date().toISOString(),
        latency_ms: latencyMs,
        model,
        usage: extractUsageFromVercelResult(result),
        tags,
        evaluation,
      } as TrackEvent;
      const event = decorateEventWithTraceV2(baseEvent, {
        options: mergedOptions,
        promptContent,
        responseContent: extractResponseFromVercelResult(result),
      });
      const ingestResult = await sendWithRetry(event, mergedOptions);
      logIngestFailure(ingestResult);
      return result as Awaited<ReturnType<TFn>>;
    } catch (error) {
      const latencyMs = Date.now() - start;
      const baseEvent = {
        schema_version: "2026-02-16",
        event_type: contract.event_type,
        provider: contract.provider,
        endpoint: contract.endpoint,
        status: "failure",
        timestamp: new Date().toISOString(),
        latency_ms: latencyMs,
        model: modelHint,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
        tags,
        evaluation,
        error: {
          type: (error as Error)?.name,
          message: (error as Error)?.message,
        },
      } as TrackEvent;
      const event = decorateEventWithTraceV2(baseEvent, {
        options: mergedOptions,
        promptContent,
      });
      const ingestResult = await sendWithRetry(event, mergedOptions);
      logIngestFailure(ingestResult);
      throw error;
    }
  };
};

const extractModelFromArgs = (args: any[]): string | undefined => {
  const first = args[0];
  if (first && typeof first === "object" && typeof first.model === "string" && first.model.length > 0) {
    return first.model;
  }
  return undefined;
};

const toStableJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
};

const extractPromptFromArgs = (args: any[]): string | undefined => {
  const first = args?.[0];
  if (!first || typeof first !== "object") return undefined;
  const candidate =
    (first as Record<string, unknown>).messages ??
    (first as Record<string, unknown>).input ??
    (first as Record<string, unknown>).contents ??
    (first as Record<string, unknown>).prompt;
  if (candidate === undefined) return undefined;
  return toStableJson(candidate);
};

const extractResponseContent = (response: any): string | undefined => {
  if (!response) return undefined;
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }
  if (typeof response.text === "string" && response.text.trim().length > 0) {
    return response.text;
  }

  const choices = Array.isArray(response.choices) ? response.choices : [];
  const parts: string[] = [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      parts.push(content);
    }
  }
  if (parts.length > 0) return parts.join("\n");

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (typeof item?.content === "string" && item.content.trim().length > 0) {
      return item.content;
    }
  }
  return undefined;
};

const buildTraceV2Decision = (
  options: TrackOptions,
  _fallbackEvaluation: TrackEvaluation | undefined
): TraceDecision | undefined => {
  const explicit = normalizeTraceDecision(options.decision);
  if (explicit) return explicit;

  const routingReason = options.routing_reason ?? options.routingReason;
  const route = options.route;
  if (!routingReason && !route) return undefined;

  const decision = normalizeTraceDecision({
    routing_reason: routingReason,
    route,
  });
  return decision;
};

const appendContentPayloadBlocks = (
  blocks: TracePayloadBlock[],
  promptContent: string | undefined,
  responseContent: string | undefined
): TracePayloadBlock[] => {
  const next = [...blocks];
  if (promptContent) {
    next.push({
      payload_type: "prompt_input",
      content: promptContent,
    });
  }
  if (responseContent) {
    next.push({
      payload_type: "model_output",
      content: responseContent,
    });
  }
  return next;
};

const decorateEventWithTraceV2 = (
  baseEvent: TrackEvent,
  {
    options,
    promptContent,
    responseContent,
  }: {
    options: TrackOptions;
    promptContent?: string;
    responseContent?: string;
  }
): TrackEvent => {
  const captureContent = Boolean(options.capture_content ?? options.captureContent);
  const explicitSchema = toSchemaVersion(options.schema_version ?? options.schemaVersion);
  const spanKind = toSpanKind(options.span_kind ?? options.spanKind);
  const toolName = toTagValue(options.tool_name ?? options.toolName);
  const payloadRefs = normalizePayloadRefs(options.payload_refs ?? options.payloadRefs);
  const explicitPayloadBlocks = normalizeTracePayloadBlocks(
    options.payload_blocks ?? options.payloadBlocks
  );
  const payloadBlocks = captureContent
    ? appendContentPayloadBlocks(explicitPayloadBlocks, promptContent, responseContent)
    : explicitPayloadBlocks;
  const explicitMetrics = normalizeTraceMetrics(options.metrics);
  const normalizedMetrics = explicitMetrics ?? {
    prompt_tokens: baseEvent.usage.prompt_tokens,
    completion_tokens: baseEvent.usage.completion_tokens,
    total_tokens: baseEvent.usage.total_tokens,
    latency_ms: baseEvent.latency_ms,
  };
  const decision = buildTraceV2Decision(options, baseEvent.evaluation);
  const promptHash = hashContent(promptContent) ?? baseEvent.prompt_hash;
  const responseHash = hashContent(responseContent) ?? baseEvent.response_hash;
  const shouldUseV2 =
    explicitSchema === TRACE_SCHEMA_VERSION_V2 ||
    spanKind !== undefined ||
    toolName !== undefined ||
    payloadRefs.length > 0 ||
    payloadBlocks.length > 0 ||
    explicitMetrics !== undefined ||
    decision !== undefined;
  const schemaVersion = shouldUseV2 ? TRACE_SCHEMA_VERSION_V2 : TRACE_SCHEMA_VERSION_V1;

  const event: TrackEvent = {
    ...baseEvent,
    schema_version: schemaVersion,
    prompt_hash: promptHash,
    response_hash: responseHash,
  };
  if (spanKind) event.span_kind = spanKind;
  if (toolName) event.tool_name = toolName;
  if (payloadRefs.length > 0) event.payload_refs = payloadRefs;
  if (payloadBlocks.length > 0) event.payload_blocks = payloadBlocks;
  if (schemaVersion === TRACE_SCHEMA_VERSION_V2) event.metrics = normalizedMetrics;
  if (decision) event.decision = decision;
  return event;
};

const buildEvent = (
  contract: EventContract,
  latencyMs: number,
  response: any,
  modelHint: string | undefined,
  tags: TrackTags,
  evaluation: TrackEvaluation | undefined,
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
  model: contract.modelFromResponse?.(response) ?? modelHint ?? "unknown",
  usage: contract.usageFromResponse(response),
  tags,
  evaluation,
  error:
    status === "failure"
      ? {
          type: error?.name,
          message: error?.message,
        }
      : undefined,
} as TrackEvent);

const isRetryableStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

const readResponseBody = async (response: Response): Promise<string | undefined> => {
  try {
    const body = (await response.text()).trim();
    if (!body) return undefined;
    return body.slice(0, MAX_ERROR_BODY_LENGTH);
  } catch {
    return undefined;
  }
};

const logIngestFailure = (result: IngestResult): void => {
  if (result.ok) return;
  const statusPart = result.status ? ` (HTTP ${result.status})` : "";
  if (typeof console?.warn === "function") {
    console.warn(`[tokvera] ingestion failed${statusPart}: ${result.message}`);
  }
};

const sendWithRetry = async (event: TrackEvent, options: TrackOptions): Promise<IngestResult> => {
  const url = options.ingest_url ?? options.ingestUrl ?? process.env.TOKVERA_INGEST_URL;
  if (!url) return { ok: true };

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
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { ok: true };
      }

      const body = await readResponseBody(response);
      const message = body ?? response.statusText ?? "Ingest request failed with non-2xx response.";
      if (attempt >= DEFAULT_MAX_RETRIES || !isRetryableStatus(response.status)) {
        return {
          ok: false,
          status: response.status,
          message,
        };
      }
    } catch {
      clearTimeout(timeoutId);
      if (attempt >= DEFAULT_MAX_RETRIES) {
        return {
          ok: false,
          message: "Network error while sending event to Tokvera ingest endpoint.",
        };
      }
      await sleep(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    if (attempt < DEFAULT_MAX_RETRIES) {
      await sleep(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return {
    ok: false,
    message: "Failed to ingest event after retries.",
  };
};

const wrapCreate = (
  originalCreate: AnyFunction,
  contract: EventContract,
  options: TrackOptions
) => {
  return async (...args: any[]) => {
    const start = Date.now();
    const modelHint = extractModelFromArgs(args);
    const promptContent = extractPromptFromArgs(args);
    const tags = getTags(options);
    const evaluation = getEvaluation(options);
    try {
      const response = await originalCreate(...args);
      const latencyMs = Date.now() - start;
      const baseEvent = buildEvent(contract, latencyMs, response, modelHint, tags, evaluation, "success");
      const event = decorateEventWithTraceV2(baseEvent, {
        options,
        promptContent,
        responseContent: extractResponseContent(response),
      });
      void sendWithRetry(event, options).then(logIngestFailure);
      return response;
    } catch (error) {
      const latencyMs = Date.now() - start;
      const baseEvent = buildEvent(
        contract,
        latencyMs,
        undefined,
        modelHint,
        tags,
        evaluation,
        "failure",
        error as Error
      );
      const event = decorateEventWithTraceV2(baseEvent, {
        options,
        promptContent,
      });
      void sendWithRetry(event, options).then(logIngestFailure);
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
  BackgroundJobContext,
  BackgroundJobContextOptions,
  BullMQJobLike,
  ExpressLikeNext,
  ExpressLikeRequest,
  ExpressLikeResponse,
  NestExecutionContextLike,
  NextLikeRequest,
  NextRouteContextOptions,
  LangChainCallbackOptions,
  LangChainLLMResult,
  LangChainSerialized,
  ExpressMiddlewareOptions,
  ExpressValueResolver,
  GeminiTrackEvent,
  OpenAITrackEvent,
  TrackEvaluation,
  TrackEvent,
  TrackOptions,
  TrackTags,
  Usage,
  VercelAICallParams,
  VercelAIResult,
  VercelAITrackOptions,
  VercelAIUsage,
} from "./types.js";
