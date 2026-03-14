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

export type NextLikeHeaders = {
  get?: (name: string) => string | null | undefined;
  [key: string]: unknown;
};

export type NextLikeRequest = {
  headers?: NextLikeHeaders | Record<string, ExpressHeaderValue>;
  method?: string;
  url?: string;
  nextUrl?: {
    pathname?: string;
  };
  pathname?: string;
  tokvera?: TrackOptions;
  [key: string]: unknown;
};

export type NextRouteContextOptions = ExpressMiddlewareOptions;

export type NestExecutionContextLike = {
  switchToHttp?: () => {
    getRequest?: () => ExpressLikeRequest | undefined;
    getResponse?: () => ExpressLikeResponse | undefined;
  };
};

export type BullMQJobLike = {
  id?: string | number;
  name?: string;
  queueName?: string;
  data?: Record<string, unknown>;
  opts?: {
    attempts?: number;
    [key: string]: unknown;
  };
  attemptsMade?: number;
  [key: string]: unknown;
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
  emit_lifecycle_events?: boolean;
  emitLifecycleEvents?: boolean;
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

export type ManualTraceUsage = Partial<Usage> & {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type TokveraTraceProvider = "openai" | "anthropic" | "gemini" | "mistral" | "tokvera";

export type TokveraTraceHandle = {
  trace_id: string;
  run_id: string;
  span_id: string;
  parent_span_id?: string;
  started_at: number;
  provider: TokveraTraceProvider;
  event_type: string;
  endpoint: string;
  model?: string;
  options: TrackOptions;
};

export type TokveraTracer = {
  baseOptions: TrackOptions;
  startTrace: (options?: ManualSpanStartOptions) => TokveraTraceHandle;
  startSpan: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  finishSpan: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  failSpan: (handle: TokveraTraceHandle, error: unknown, options?: ManualSpanFinishOptions) => void;
  attachPayload: (
    handle: TokveraTraceHandle,
    payload:
      | TracePayloadBlock
      | TracePayloadBlock[]
      | {
          payload_type?: TracePayloadType;
          content?: string;
        }
  ) => TokveraTraceHandle;
  getTrackOptionsFromTraceContext: (
    handle: TokveraTraceHandle,
    overrides?: TrackOptions
  ) => TrackOptions;
};

export type TokveraLifecycleAdapter = {
  runtime: string;
  tracer: TokveraTracer;
  startRun: (options?: ManualSpanStartOptions) => TokveraTraceHandle;
  finishRun: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  failRun: (handle: TokveraTraceHandle, error: unknown, options?: ManualSpanFinishOptions) => void;
  startTool: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  finishTool: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  failTool: (handle: TokveraTraceHandle, error: unknown, options?: ManualSpanFinishOptions) => void;
  startModel: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  finishModel: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  failModel: (handle: TokveraTraceHandle, error: unknown, options?: ManualSpanFinishOptions) => void;
  startNode: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  finishNode: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  failNode: (handle: TokveraTraceHandle, error: unknown, options?: ManualSpanFinishOptions) => void;
  startBranch: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  finishBranch: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  failBranch: (handle: TokveraTraceHandle, error: unknown, options?: ManualSpanFinishOptions) => void;
  getTrackOptionsFromTraceContext: (
    handle: TokveraTraceHandle,
    overrides?: TrackOptions
  ) => TrackOptions;
  attachPayload: TokveraTracer["attachPayload"];
};

export type TokveraOpenAIAgentsTracingProcessor = TokveraLifecycleAdapter & {
  onAgentStart: (options?: ManualSpanStartOptions) => TokveraTraceHandle;
  onAgentEnd: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  onAgentError: (
    handle: TokveraTraceHandle,
    error: unknown,
    options?: ManualSpanFinishOptions
  ) => void;
  onToolStart: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  onToolEnd: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  onToolError: (
    handle: TokveraTraceHandle,
    error: unknown,
    options?: ManualSpanFinishOptions
  ) => void;
  onModelStart: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  onModelEnd: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  onModelError: (
    handle: TokveraTraceHandle,
    error: unknown,
    options?: ManualSpanFinishOptions
  ) => void;
};

export type TokveraLangGraphHooks = TokveraLifecycleAdapter & {
  onGraphStart: (options?: ManualSpanStartOptions) => TokveraTraceHandle;
  onGraphEnd: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  onGraphError: (
    handle: TokveraTraceHandle,
    error: unknown,
    options?: ManualSpanFinishOptions
  ) => void;
  onNodeStart: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  onNodeEnd: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  onNodeError: (
    handle: TokveraTraceHandle,
    error: unknown,
    options?: ManualSpanFinishOptions
  ) => void;
  onBranchStart: (parent: TokveraTraceHandle, options?: ManualSpanStartOptions) => TokveraTraceHandle;
  onBranchEnd: (handle: TokveraTraceHandle, options?: ManualSpanFinishOptions) => void;
  onBranchError: (
    handle: TokveraTraceHandle,
    error: unknown,
    options?: ManualSpanFinishOptions
  ) => void;
};

export type ManualSpanStartOptions = TrackOptions & {
  provider?: TokveraTraceProvider;
  event_type?: string;
  endpoint?: string;
  model?: string;
  usage?: ManualTraceUsage;
};

export type ManualSpanFinishOptions = TrackOptions & {
  provider?: TokveraTraceProvider;
  event_type?: string;
  endpoint?: string;
  model?: string;
  usage?: ManualTraceUsage;
  latency_ms?: number;
  response?: unknown;
  prompt?: unknown;
  input?: unknown;
};

export type OTelAttributeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export type OTelReadableSpanLike = {
  name?: string;
  startTime?: [number, number];
  endTime?: [number, number];
  duration?: [number, number];
  status?: { code?: number; message?: string };
  attributes?: Record<string, OTelAttributeValue>;
  resource?: { attributes?: Record<string, OTelAttributeValue> };
  instrumentationScope?: { name?: string };
  parentSpanId?: string;
  spanContext?: () => { spanId?: string; traceId?: string };
};

type BaseTrackEvent = {
  schema_version: "2026-02-16" | "2026-04-01";
  status: "in_progress" | "success" | "failure";
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

export type MistralTrackEvent = BaseTrackEvent & {
  event_type: "mistral.request";
  provider: "mistral";
  endpoint: "chat.complete";
};

export type TokveraTraceEvent = BaseTrackEvent & {
  event_type: "tokvera.trace";
  provider: "tokvera";
  endpoint: "manual.trace" | "manual.span" | "otel.span";
};

export type TrackEvent =
  | OpenAITrackEvent
  | AnthropicTrackEvent
  | GeminiTrackEvent
  | MistralTrackEvent
  | TokveraTraceEvent;
