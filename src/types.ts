export type TrackTags = {
  feature?: string;
  tenant_id?: string;
  customer_id?: string;
  plan?: string;
  environment?: string;
  template_id?: string;
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

export type OpenAITrackEvent = {
  schema_version: "2026-02-16";
  event_type: "openai.request";
  provider: "openai";
  endpoint: "chat.completions.create" | "responses.create";
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
