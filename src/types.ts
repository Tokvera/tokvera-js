export type TrackOptions = {
  feature?: string;
  tenant_id?: string;
  customer_id?: string;
  plan?: string;
  environment?: string;
  template_id?: string;
};

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type OpenAITrackEvent = {
  event_type: "openai.request";
  timestamp: string;
  latency_ms: number;
  endpoint: "chat.completions.create" | "responses.create";
  model?: string;
  usage?: Usage;
  tags?: TrackOptions;
};
