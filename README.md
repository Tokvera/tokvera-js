# @tokvera/sdk

JavaScript SDK for Tokvera AI cost and trace telemetry.

Current version: `0.2.7`

## What It Tracks

- OpenAI (`chat.completions.create`, `responses.create`)
- Anthropic (`messages.create`)
- Gemini (`models.generateContent` / `generate_content`)

Each tracked call emits normalized telemetry to Tokvera ingest (`/v1/events`) with:
- latency, status, model, token usage
- trace context (`trace_id`, `run_id`, `span_id`, `parent_span_id`, `conversation_id`)
- evaluation signals (`outcome`, `retry_reason`, `fallback_reason`, `quality_label`, `feedback_score`)
- optional v2 trace fields (span/tool metadata, payload refs/blocks, per-step metrics, routing decisions)

## Install

```bash
npm install @tokvera/sdk
```

## Quick Start

```ts
import OpenAI from "openai";
import { trackOpenAI } from "@tokvera/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tracked = trackOpenAI(openai, {
  api_key: process.env.TOKVERA_API_KEY,
  feature: "support_bot",
  tenant_id: "acme",
  environment: "production",
  step_name: "draft_reply",
  emitLifecycleEvents: true,
});

await tracked.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});
```

Enable `emitLifecycleEvents: true` when you want `/dashboard/traces/live` to show a run immediately at call start and keep it marked as processing until the terminal event lands.

Set ingest URL (optional if using default):

```bash
export TOKVERA_INGEST_URL="https://api.tokvera.org/v1/events"
```

## Integration Helpers

Framework/runtime helpers shipped in this SDK:

- Express:
  - `createTokveraExpressMiddleware(...)`
  - `getTrackOptionsFromExpressRequest(...)`
- Next.js route handlers/server actions:
  - `createTokveraNextRouteContext(...)`
  - `getTrackOptionsFromNextRouteContext(...)`
- NestJS:
  - `createTokveraNestMiddleware(...)`
  - `getTrackOptionsFromNestExecutionContext(...)`
- Background jobs:
  - `createTokveraBackgroundJobContext(...)`
  - `getTrackOptionsFromBackgroundJobContext(...)`
- BullMQ:
  - `createTokveraBullMQJobContext(...)`
  - `getTrackOptionsFromBullMQJobContext(...)`
- LangChain:
  - `createTokveraLangChainCallback(...)`
- Vercel AI SDK:
  - `wrapVercelAIGenerateText(...)`

## Trace Schema Support

- v1 schema version: `2026-02-16`
- v2 schema version: `2026-04-01`

Contract references:
- `tokvera-api/docs/event-envelope-v1.contract.json`
- `tokvera-api/docs/event-envelope-v2.contract.json`
- `tokvera-api/docs/SCHEMA_COMPATIBILITY_POLICY.md`

## Privacy Behavior

- Tracking is fire-and-forget and non-blocking
- Prompt/output content is not required
- If you enable content capture in v2 mode, hashes/blocks are attached based on options

## Examples

- `examples/quickstart.ts`
- `examples/express-middleware.ts`
- `examples/background-jobs.ts`

## Realtime Tracing

- `/dashboard/traces` is the main engineering workspace for execution, payload, and optimization debugging.
- `/dashboard/traces/live` is the realtime feed for active and recently completed runs.
- Lifecycle start events are additive. They do not replace the normal terminal success/failure event.

## Test

```bash
npm run build
npm test
npm run test:schema-compat
npm run test:canonical-contract
```
