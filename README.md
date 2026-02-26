# @tokvera/sdk

Tokvera TypeScript SDK to track OpenAI `chat.completions.create` and `responses.create` calls with latency and token usage.

## Install

```bash
npm install @tokvera/sdk
```

## Usage

```ts
import OpenAI from "openai";
import { trackOpenAI } from "@tokvera/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const tracked = trackOpenAI(openai, {
  api_key: "tokvera_project_key",
  feature: "onboarding",
  tenant_id: "tenant_123",
  customer_id: "cust_456",
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

## Configuration

Set ingestion endpoint and API key:

```bash
export TOKVERA_INGEST_URL="https://api.tokvera.com/v1/events"
export TOKVERA_API_KEY="tokvera_project_key"
```

Per-client config in `trackOpenAI(..., options)` overrides env vars.

If ingestion fails, the SDK will not throw and will not block OpenAI responses.

## Event Schema

Canonical specification: [`tokvera-api/docs/EVENT_SCHEMA.md`](https://github.com/Tokvera/tokvera-api/blob/main/docs/EVENT_SCHEMA.md)

Events include:
- `schema_version`: `2026-02-16`
- `event_type`: `openai.request`
- `provider`: `openai`
- `endpoint`: `chat.completions.create` or `responses.create`
- `status`: `success` or `failure`
- `latency_ms`
- `model`
- `usage`: `prompt_tokens`, `completion_tokens`, `total_tokens`
- `tags`: any of `feature`, `tenant_id`, `customer_id`, `plan`, `environment`, `template_id`
- `error` on failure events

## Build & Test

```bash
npm run build
npm test
```
