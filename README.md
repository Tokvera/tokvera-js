# @tokvera/sdk

Tokvera TypeScript SDK to track OpenAI, Anthropic, and Gemini calls with latency and token usage telemetry.

## Install

```bash
npm install @tokvera/sdk
```

## Usage

### OpenAI

```ts
import OpenAI from "openai";
import { trackOpenAI } from "@tokvera/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const tracked = trackOpenAI(openai, {
  api_key: "tokvera_project_key",
  feature: "onboarding",
  tenant_id: "tenant_123",
  customer_id: "cust_456",
  trace_id: "trace_checkout_784",
  conversation_id: "conv_101",
  step_name: "draft_reply",
  plan: "pro",
  environment: "production",
  template_id: "tmpl_789",
});

// Chat Completions
const chat = await tracked.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});

// Responses API
const response = await tracked.responses.create({
  model: "gpt-4o-mini",
  input: "Write a haiku about wind.",
});
```

### Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk";
import { trackAnthropic } from "@tokvera/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const tracked = trackAnthropic(anthropic, {
  api_key: "tokvera_project_key",
  feature: "support_bot",
  tenant_id: "tenant_123",
});

await tracked.messages.create({
  model: "claude-3-5-sonnet-latest",
  max_tokens: 256,
  messages: [{ role: "user", content: "Hello" }],
});
```

### Gemini

```ts
import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "@tokvera/sdk";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const tracked = trackGemini(gemini, {
  api_key: "tokvera_project_key",
  feature: "assistant",
  tenant_id: "tenant_123",
});

await tracked.models.generateContent({
  model: "gemini-2.0-flash",
  contents: "Hello",
});
```

## Configuration

Set ingestion endpoint and API key:

```bash
export TOKVERA_INGEST_URL="https://api.tokvera.com/v1/events"
export TOKVERA_API_KEY="tokvera_project_key"
```

Per-client config in `trackOpenAI(...)`, `trackAnthropic(...)`, or `trackGemini(...)` overrides env vars.

If ingestion fails, the SDK will not throw and will not block OpenAI responses.

## Event Schema

Canonical specification: [`tokvera-api/docs/EVENT_SCHEMA.md`](https://github.com/Tokvera/tokvera-api/blob/main/docs/EVENT_SCHEMA.md)

Events include:
- `schema_version`: `2026-02-16`
- `event_type`: `openai.request`, `anthropic.request`, or `gemini.request`
- `provider`: `openai`, `anthropic`, or `gemini`
- `endpoint`: `chat.completions.create`, `responses.create`, `messages.create`, `models.generate_content`
- `status`: `success` or `failure`
- `latency_ms`
- `model`
- `usage`: `prompt_tokens`, `completion_tokens`, `total_tokens`
- `tags`: any of `feature`, `tenant_id`, `customer_id`, `attempt_type`, `plan`, `environment`, `template_id`, `trace_id`, `conversation_id`, `span_id`, `parent_span_id`, `step_name`
- `error` on failure events

`trace_id` and `span_id` are auto-generated per request if not provided.

## Build & Test

```bash
npm run build
npm test
```
