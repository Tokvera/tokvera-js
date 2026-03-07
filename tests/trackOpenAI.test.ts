import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackOpenAI } from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("trackOpenAI", () => {
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

  it("proxies chat.completions.create and emits a unified success event", async () => {
    const response = {
      id: "chat_1",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
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
      feature: "checkout",
      tenant_id: "tenant_1",
      attempt_type: "regenerate",
      trace_id: "trace_checkout_42",
      run_id: "run_checkout_42",
      conversation_id: "conv_123",
      parent_span_id: "spn_parent_1",
      step_name: "draft_reply",
      outcome: "success",
      retry_reason: "none",
      fallback_reason: "none",
      quality_label: "good",
      feedback_score: 5,
      api_key: "project_key_123",
    });
    const result = await tracked.chat.completions.create({ messages: [] });

    expect(result).toBe(response);
    expect(openaiClient.chat.completions.create).toHaveBeenCalledOnce();

    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(init.headers.authorization).toBe("Bearer project_key_123");
    expect(event.schema_version).toBe("2026-02-16");
    expect(event.provider).toBe("openai");
    expect(event.event_type).toBe("openai.request");
    expect(event.endpoint).toBe("chat.completions.create");
    expect(event.status).toBe("success");
    expect(event.usage.total_tokens).toBe(8);
    expect(event.tags.feature).toBe("checkout");
    expect(event.tags.tenant_id).toBe("tenant_1");
    expect(event.tags.attempt_type).toBe("regenerate");
    expect(event.tags.trace_id).toBe("trace_checkout_42");
    expect(event.tags.run_id).toBe("run_checkout_42");
    expect(event.tags.conversation_id).toBe("conv_123");
    expect(event.tags.parent_span_id).toBe("spn_parent_1");
    expect(event.tags.step_name).toBe("draft_reply");
    expect(event.tags.outcome).toBe("success");
    expect(event.tags.retry_reason).toBe("none");
    expect(event.tags.fallback_reason).toBe("none");
    expect(event.tags.quality_label).toBe("good");
    expect(event.tags.feedback_score).toBe("5");
    expect(event.evaluation.outcome).toBe("success");
    expect(event.evaluation.feedback_score).toBe(5);
    expect(typeof event.tags.span_id).toBe("string");
    expect(event.tags.span_id.length).toBeGreaterThan(0);
  });

  it("proxies responses.create and emits a unified success event", async () => {
    const response = {
      id: "resp_1",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 },
    };
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      responses: {
        create: vi.fn().mockResolvedValue(response),
      },
    };

    const tracked = trackOpenAI(openaiClient, { environment: "test" });
    const result = await tracked.responses.create({ input: "hi" });

    expect(result).toBe(response);
    expect(openaiClient.responses.create).toHaveBeenCalledOnce();

    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(init.headers.authorization).toBe("Bearer env_api_key");
    expect(event.endpoint).toBe("responses.create");
    expect(event.status).toBe("success");
    expect(event.usage.completion_tokens).toBe(4);
    expect(event.tags.environment).toBe("test");
    expect(typeof event.tags.trace_id).toBe("string");
    expect(typeof event.tags.span_id).toBe("string");
  });

  it("emits failure event and rethrows when OpenAI call fails", async () => {
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("openai failure")),
        },
      },
      responses: {
        create: vi.fn(),
      },
    };

    const tracked = trackOpenAI(openaiClient, { feature: "billing" });

    await expect(tracked.chat.completions.create({ messages: [] })).rejects.toThrow(
      "openai failure"
    );

    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(event.endpoint).toBe("chat.completions.create");
    expect(event.status).toBe("failure");
    expect(event.error.message).toBe("openai failure");
    expect(event.usage.total_tokens).toBe(0);
  });

  it("does not emit when ingestion URL is not set", async () => {
    process.env.TOKVERA_INGEST_URL = "";
    const response = { id: "chat_2" };
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

    const tracked = trackOpenAI(openaiClient);
    const result = await tracked.chat.completions.create({ messages: [] });

    expect(result).toBe(response);
    await flushPromises();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("treats non-2xx ingest responses as failures and logs warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      text: vi.fn().mockResolvedValue('{"code":"PROJECT_HARD_CAP_REACHED"}'),
    }) as any;

    const response = {
      id: "chat_3",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
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

    const tracked = trackOpenAI(openaiClient, { feature: "billing" });
    const result = await tracked.chat.completions.create({ messages: [] });

    expect(result).toBe(response);
    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("ingestion failed");
    expect(warnSpy.mock.calls[0][0]).toContain("HTTP 402");
  });
});
