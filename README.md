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

Set the ingestion endpoint:

```bash
export TOKVERA_INGEST_URL="https://your-ingest-host/v1/ingest"
```

If the ingestion endpoint is missing or fails, the SDK will not throw and will not block OpenAI responses.

## Event Schema

Events include:
- `endpoint`: `chat.completions.create` or `responses.create`
- `latency_ms`
- `model`
- `usage`: `prompt_tokens`, `completion_tokens`, `total_tokens` (when available)
- `tags`: any of `feature`, `tenant_id`, `customer_id`, `plan`, `environment`, `template_id`

## Build & Test

```bash
npm run build
npm test
```
