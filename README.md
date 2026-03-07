# @tokvera/sdk

Tokvera TypeScript SDK to track OpenAI, Anthropic, and Gemini calls with latency and token usage telemetry.

## What's New in v0.2.1

- Added Trace Context v1 tags.
- New optional tags: `trace_id`, `run_id`, `conversation_id`, `span_id`, `parent_span_id`, `step_name`.
- Auto-generates `trace_id` and `span_id` when you do not provide them.

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
  run_id: "run_checkout_784",
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

## Trace Context v1

Use trace tags to reconstruct request chains without sending prompt payloads.

Recommended semantics:
- `trace_id`: one end-to-end workflow/request.
- `run_id`: one execution run of an agent/workflow.
- `conversation_id`: one user conversation/session.
- `span_id`: one model call.
- `parent_span_id`: parent model call when nested.
- `step_name`: readable stage label (`retrieve_context`, `draft_reply`, `quality_retry`).

Example:

```ts
const tracked = trackOpenAI(openai, {
  api_key: process.env.TOKVERA_API_KEY!,
  feature: "support_bot",
  tenant_id: "acme",
  trace_id: "trace_req_20260304_001",
  run_id: "run_agent_20260304_001",
  conversation_id: "conv_9832",
  span_id: "span_root_1",
  parent_span_id: null,
  step_name: "draft_reply",
});
```

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
- `tags`: any of `feature`, `tenant_id`, `customer_id`, `attempt_type`, `plan`, `environment`, `template_id`, `trace_id`, `run_id`, `conversation_id`, `span_id`, `parent_span_id`, `step_name`
- `error` on failure events

`trace_id` and `span_id` are auto-generated per request if not provided.

## Build & Test

```bash
npm run build
npm test
npm run test:schema-compat
```
