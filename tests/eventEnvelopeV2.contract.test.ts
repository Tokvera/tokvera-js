import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackOpenAI } from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const allowedTopLevelFields = new Set([
  "schema_version",
  "event_type",
  "provider",
  "endpoint",
  "status",
  "timestamp",
  "latency_ms",
  "model",
  "usage",
  "tags",
  "prompt_hash",
  "response_hash",
  "error",
  "evaluation",
  "span_kind",
  "tool_name",
  "payload_refs",
  "payload_blocks",
  "metrics",
  "decision",
]);

const allowedMetricsFields = new Set([
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "latency_ms",
  "cost_usd",
]);

const allowedDecisionFields = new Set([
  "outcome",
  "retry_reason",
  "fallback_reason",
  "routing_reason",
  "route",
]);

const allowedPayloadTypes = new Set([
  "prompt_input",
  "tool_input",
  "tool_output",
  "model_output",
  "context",
  "other",
]);

describe("event envelope v2 compatibility", () => {
  const originalIngestUrl = process.env.TOKVERA_INGEST_URL;
  const originalApiKey = process.env.TOKVERA_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    process.env.TOKVERA_INGEST_URL = "https://ingest.example.test/v1/events";
    process.env.TOKVERA_API_KEY = "env_api_key";
  });

  afterEach(() => {
    process.env.TOKVERA_INGEST_URL = originalIngestUrl;
    process.env.TOKVERA_API_KEY = originalApiKey;
  });

  it("emits v2 envelope with trace-rich optional fields", async () => {
    const response = {
      id: "chat_v2_1",
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Here is the answer." } }],
      usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
    };
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(response),
        },
      },
      responses: {
        create: vi.fn(),
      },
    };

    const tracked = trackOpenAI(openaiClient, {
      schema_version: "2026-04-01",
      span_kind: "tool",
      tool_name: "search_docs",
      capture_content: true,
      payload_refs: ["ref_123"],
      payload_blocks: [{ payload_type: "context", content: "tenant policy excerpt" }],
      metrics: { cost_usd: 0.00042 },
      decision: { routing_reason: "budget_route", route: "gpt-4o-mini" },
      feature: "assistant",
      tenant_id: "tenant_1",
      api_key: "project_key_123",
    });

    await tracked.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });
    await flushPromises();

    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const event = JSON.parse(init.body);

    expect(event.schema_version).toBe("2026-04-01");
    const unknownTopLevel = Object.keys(event).filter((field) => !allowedTopLevelFields.has(field));
    expect(unknownTopLevel).toHaveLength(0);

    expect(event.span_kind).toBe("tool");
    expect(event.tool_name).toBe("search_docs");
    expect(event.payload_refs).toEqual(["ref_123"]);
    expect(Array.isArray(event.payload_blocks)).toBe(true);
    expect(event.payload_blocks.length).toBeGreaterThan(0);
    for (const block of event.payload_blocks) {
      expect(allowedPayloadTypes.has(block.payload_type)).toBe(true);
      expect(typeof block.content).toBe("string");
      expect(block.content.length).toBeGreaterThan(0);
    }

    expect(event.metrics).toBeDefined();
    const unknownMetricFields = Object.keys(event.metrics ?? {}).filter(
      (field) => !allowedMetricsFields.has(field)
    );
    expect(unknownMetricFields).toHaveLength(0);
    expect(event.metrics.cost_usd).toBe(0.00042);

    expect(event.decision).toBeDefined();
    const unknownDecisionFields = Object.keys(event.decision ?? {}).filter(
      (field) => !allowedDecisionFields.has(field)
    );
    expect(unknownDecisionFields).toHaveLength(0);
    expect(event.decision.routing_reason).toBe("budget_route");
    expect(event.decision.route).toBe("gpt-4o-mini");

    expect(typeof event.prompt_hash).toBe("string");
    expect(typeof event.response_hash).toBe("string");
  });

  it("maps legacy metrics alias estimated_cost_usd into v2 cost_usd", async () => {
    const response = {
      id: "chat_v2_2",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(response),
        },
      },
      responses: {
        create: vi.fn(),
      },
    };

    const tracked = trackOpenAI(openaiClient, {
      schema_version: "2026-04-01",
      metrics: { estimated_cost_usd: 0.00007 },
      feature: "assistant",
      tenant_id: "tenant_1",
      api_key: "project_key_123",
    });

    await tracked.chat.completions.create({ model: "gpt-4o-mini", messages: [] });
    await flushPromises();

    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const event = JSON.parse(init.body);

    expect(event.schema_version).toBe("2026-04-01");
    expect(event.metrics.cost_usd).toBe(0.00007);
    expect(event.metrics.estimated_cost_usd).toBeUndefined();
  });
});
