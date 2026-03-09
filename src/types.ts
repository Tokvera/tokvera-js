export type TrackTags = {
  feature?: string;
  tenant_id?: string;
  customer_id?: string;
  attempt_type?: string;
  plan?: string;
  environment?: string;
  template_id?: string;
  trace_id?: string;
  run_id?: string;
  conversation_id?: string;
  span_id?: string;
  parent_span_id?: string;
  step_name?: string;
  outcome?: string;
  retry_reason?: string;
  fallback_reason?: string;
  quality_label?: string;
  feedback_score?: string | number;
};

export type SpanKind = "model" | "tool" | "orchestrator" | "retrieval" | "guardrail";

export type TracePayloadType =
  | "prompt_input"
  | "tool_input"
  | "tool_output"
  | "model_output"
  | "context"
  | "other";

export type TracePayloadBlock = {
  payload_type: TracePayloadType;
  content: string;
};

export type TraceMetrics = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  estimated_cost_usd?: number;
  latency_ms?: number;
};

export type TraceDecision = {
  retry_reason?: string;
  fallback_reason?: string;
  routing_reason?: string;
  route?: string;
};

export type TrackEvaluation = {
  outcome?: string;
  retry_reason?: string;
  fallback_reason?: string;
  quality_label?: string;
  feedback_score?: number | string;
};

export type ExpressHeaderValue = string | string[] | undefined;

export type ExpressLikeRequest = {
  headers?: Record<string, ExpressHeaderValue>;
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
  tokvera?: TrackOptions;
  [key: string]: unknown;
};

export type ExpressLikeResponse = {
  setHeader?: (name: string, value: string) => void;
  locals?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ExpressLikeNext = (error?: unknown) => void;

export type ExpressValueResolver<T> =
  | T
  | ((request: ExpressLikeRequest) => T | undefined | null);

export type ExpressMiddlewareOptions = {
  traceHeaderName?: string;
  runHeaderName?: string;
  conversationHeaderName?: string;
  responseTraceHeaderName?: string;
  step_name?: ExpressValueResolver<string>;
  feature?: ExpressValueResolver<string>;
  tenant_id?: ExpressValueResolver<string>;
  customer_id?: ExpressValueResolver<string>;
  attempt_type?: ExpressValueResolver<string>;
  plan?: ExpressValueResolver<string>;
  environment?: ExpressValueResolver<string>;
  template_id?: ExpressValueResolver<string>;
  run_id?: ExpressValueResolver<string>;
  conversation_id?: ExpressValueResolver<string>;
  parent_span_id?: ExpressValueResolver<string>;
  outcome?: ExpressValueResolver<string>;
  retry_reason?: ExpressValueResolver<string>;
  fallback_reason?: ExpressValueResolver<string>;
  quality_label?: ExpressValueResolver<string>;
  feedback_score?: ExpressValueResolver<number | string>;
};

export type LangChainSerialized = {
  id?: string[];
  kwargs?: Record<string, unknown>;
  [key: string]: unknown;
};

export type LangChainLLMResult = {
  llmOutput?: Record<string, unknown>;
  llm_output?: Record<string, unknown>;
  generations?: unknown[];
  [key: string]: unknown;
};

export type LangChainCallbackOptions = TrackOptions & {
  provider?: TrackEvent["provider"];
  endpoint?: TrackEvent["endpoint"];
  model?: string;
  runIdAsTraceId?: boolean;
};

export type VercelAIUsage = {
  promptTokens?: number;
  prompt_tokens?: number;
  completionTokens?: number;
  completion_tokens?: number;
  totalTokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  input_tokens?: number;
  outputTokens?: number;
  output_tokens?: number;
  [key: string]: unknown;
};

export type VercelAIResult = {
  usage?: VercelAIUsage;
  model?: string;
  modelId?: string;
  model_id?: string;
  providerMetadata?: Record<string, unknown>;
  provider_metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type VercelAICallParams = {
  model?: string | { modelId?: string; model_id?: string; id?: string };
  [key: string]: unknown;
};

export type VercelAITrackOptions = TrackOptions & {
  provider?: TrackEvent["provider"];
  endpoint?: TrackEvent["endpoint"];
  model?: string;
};

export type TrackOptions = TrackTags &
  TrackEvaluation & {
  api_key?: string;
  apiKey?: string;
  ingest_url?: string;
  ingestUrl?: string;
  schema_version?: "2026-02-16" | "2026-04-01";
  schemaVersion?: "2026-02-16" | "2026-04-01";
  capture_content?: boolean;
  captureContent?: boolean;
  span_kind?: SpanKind;
  spanKind?: SpanKind;
  tool_name?: string;
  toolName?: string;
  metrics?: TraceMetrics;
  decision?: TraceDecision;
  routing_reason?: string;
  routingReason?: string;
  route?: string;
  payload_refs?: string[];
  payloadRefs?: string[];
  payload_blocks?: TracePayloadBlock[];
  payloadBlocks?: TracePayloadBlock[];
};

export type BackgroundJobContextOptions = TrackOptions & {
  job_id?: string;
  root_span_id?: string;
};

export type BackgroundJobContext = {
  job_id?: string;
  trace_id: string;
  run_id: string;
  conversation_id?: string;
  root_span_id: string;
  base_track_options: TrackOptions;
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type TrackError = {
  type?: string;
  message?: string;
};

type BaseTrackEvent = {
  schema_version: "2026-02-16" | "2026-04-01";
  status: "success" | "failure";
  timestamp: string;
  latency_ms: number;
  model?: string;
  usage: Usage;
  tags: TrackTags;
  evaluation?: TrackEvaluation;
  prompt_hash?: string;
  response_hash?: string;
  span_kind?: SpanKind;
  tool_name?: string;
  payload_refs?: string[];
  payload_blocks?: TracePayloadBlock[];
  metrics?: TraceMetrics;
  decision?: TraceDecision;
  error?: TrackError;
};

export type OpenAITrackEvent = BaseTrackEvent & {
  event_type: "openai.request";
  provider: "openai";
  endpoint: "chat.completions.create" | "responses.create";
};

export type AnthropicTrackEvent = BaseTrackEvent & {
  event_type: "anthropic.request";
  provider: "anthropic";
  endpoint: "messages.create";
};

export type GeminiTrackEvent = BaseTrackEvent & {
  event_type: "gemini.request";
  provider: "gemini";
  endpoint: "models.generate_content";
};

export type TrackEvent = OpenAITrackEvent | AnthropicTrackEvent | GeminiTrackEvent;
