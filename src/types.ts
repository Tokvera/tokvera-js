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

export type TrackOptions = TrackTags &
  TrackEvaluation & {
  api_key?: string;
  apiKey?: string;
  ingest_url?: string;
  ingestUrl?: string;
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
  schema_version: "2026-02-16";
  status: "success" | "failure";
  timestamp: string;
  latency_ms: number;
  model?: string;
  usage: Usage;
  tags: TrackTags;
  evaluation?: TrackEvaluation;
  prompt_hash?: string;
  response_hash?: string;
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
