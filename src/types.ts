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
};

export type TrackOptions = TrackTags & {
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
