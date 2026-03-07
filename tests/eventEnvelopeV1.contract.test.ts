import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackAnthropic, trackGemini, trackOpenAI } from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

type CanonicalExpectations = {
  provider: "openai" | "anthropic" | "gemini";
  eventType: "openai.request" | "anthropic.request" | "gemini.request";
  endpoint: "chat.completions.create" | "responses.create" | "messages.create" | "models.generate_content";
  status: "success" | "failure";
};

const assertCanonicalEnvelopeV1 = (event: any, expected: CanonicalExpectations) => {
  expect(event.schema_version).toBe("2026-02-16");
  expect(event.provider).toBe(expected.provider);
  expect(event.event_type).toBe(expected.eventType);
  expect(event.endpoint).toBe(expected.endpoint);
  expect(event.status).toBe(expected.status);
  expect(typeof event.timestamp).toBe("string");
  expect(typeof event.latency_ms).toBe("number");
  expect(event.latency_ms).toBeGreaterThanOrEqual(0);
  expect(typeof event.model).toBe("string");

  expect(typeof event.usage?.prompt_tokens).toBe("number");
  expect(typeof event.usage?.completion_tokens).toBe("number");
  expect(typeof event.usage?.total_tokens).toBe("number");
  expect(event.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
  expect(event.usage.completion_tokens).toBeGreaterThanOrEqual(0);
  expect(event.usage.total_tokens).toBeGreaterThanOrEqual(0);

  expect(typeof event.tags?.trace_id).toBe("string");
  expect(event.tags.trace_id.length).toBeGreaterThan(0);
  expect(typeof event.tags?.span_id).toBe("string");
  expect(event.tags.span_id.length).toBeGreaterThan(0);
};

describe("event envelope v1 compatibility", () => {
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

  it("matches canonical envelope for OpenAI and preserves run/span chain tags", async () => {
    const response = {
      id: "chat_1",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 },
    };
    const openaiClient = {
      chat: { completions: { create: vi.fn().mockResolvedValue(response) } },
      responses: { create: vi.fn() },
    };

    const tracked = trackOpenAI(openaiClient, {
      trace_id: "trc_contract_1",
      run_id: "run_contract_1",
      span_id: "spn_contract_1",
      parent_span_id: "spn_parent_contract_1",
      conversation_id: "conv_contract_1",
      step_name: "draft_reply",
    });

    await tracked.chat.completions.create({ model: "gpt-4o-mini", messages: [] });
    await flushPromises();

    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const event = JSON.parse(init.body);

    assertCanonicalEnvelopeV1(event, {
      provider: "openai",
      eventType: "openai.request",
      endpoint: "chat.completions.create",
      status: "success",
    });

    expect(event.tags.run_id).toBe("run_contract_1");
    expect(event.tags.parent_span_id).toBe("spn_parent_contract_1");
    expect(event.tags.conversation_id).toBe("conv_contract_1");
    expect(event.tags.step_name).toBe("draft_reply");
  });

  it("matches canonical envelope and usage normalization for Anthropic", async () => {
    const response = {
      model: "claude-3-5-sonnet-latest",
      usage: { input_tokens: 11, output_tokens: 9 },
    };
    const anthropicClient = {
      messages: { create: vi.fn().mockResolvedValue(response) },
    };

    const tracked = trackAnthropic(anthropicClient);
    await tracked.messages.create({ model: "claude-3-5-sonnet-latest", messages: [] });
    await flushPromises();

    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const event = JSON.parse(init.body);

    assertCanonicalEnvelopeV1(event, {
      provider: "anthropic",
      eventType: "anthropic.request",
      endpoint: "messages.create",
      status: "success",
    });

    expect(event.usage.prompt_tokens).toBe(11);
    expect(event.usage.completion_tokens).toBe(9);
    expect(event.usage.total_tokens).toBe(20);
  });

  it("matches canonical envelope and usage normalization for Gemini", async () => {
    const response = {
      modelVersion: "gemini-2.0-flash",
      usageMetadata: {
        promptTokenCount: 13,
        candidatesTokenCount: 8,
        totalTokenCount: 21,
      },
    };
    const geminiClient = {
      models: { generateContent: vi.fn().mockResolvedValue(response) },
    };

    const tracked = trackGemini(geminiClient);
    await tracked.models.generateContent?.({ model: "gemini-2.0-flash", contents: "hi" });
    await flushPromises();

    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const event = JSON.parse(init.body);

    assertCanonicalEnvelopeV1(event, {
      provider: "gemini",
      eventType: "gemini.request",
      endpoint: "models.generate_content",
      status: "success",
    });

    expect(event.usage.prompt_tokens).toBe(13);
    expect(event.usage.completion_tokens).toBe(8);
    expect(event.usage.total_tokens).toBe(21);
  });
});
