import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wrapVercelAIGenerateText } from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Vercel AI SDK helper", () => {
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

  it("wraps generateText and emits normalized success event", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: "hello",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });

    const trackedGenerateText = wrapVercelAIGenerateText(generateText, {
      api_key: "project_key_123",
      feature: "chat_reply",
      tenant_id: "acme",
      step_name: "draft_reply",
      quality_label: "good",
      feedback_score: 5,
    });

    const result = await trackedGenerateText({
      model: { modelId: "gpt-4o-mini" },
      messages: [{ role: "user", content: "hello" }],
    });
    await flushPromises();

    expect(result.text).toBe("hello");
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(init.headers.authorization).toBe("Bearer project_key_123");
    expect(event.provider).toBe("openai");
    expect(event.event_type).toBe("openai.request");
    expect(event.endpoint).toBe("responses.create");
    expect(event.status).toBe("success");
    expect(event.model).toBe("gpt-4o-mini");
    expect(event.usage.prompt_tokens).toBe(10);
    expect(event.usage.completion_tokens).toBe(5);
    expect(event.usage.total_tokens).toBe(15);
    expect(event.tags.feature).toBe("chat_reply");
    expect(event.tags.step_name).toBe("draft_reply");
    expect(event.evaluation.quality_label).toBe("good");
    expect(event.evaluation.feedback_score).toBe(5);
  });

  it("emits failure event and infers anthropic contract from model", async () => {
    const generateText = vi.fn().mockRejectedValue(new Error("provider failed"));
    const trackedGenerateText = wrapVercelAIGenerateText(generateText, {
      feature: "chat_reply",
      tenant_id: "acme",
    });

    await expect(
      trackedGenerateText({ model: "claude-3-5-sonnet-latest", messages: [] })
    ).rejects.toThrow("provider failed");
    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(event.provider).toBe("anthropic");
    expect(event.event_type).toBe("anthropic.request");
    expect(event.endpoint).toBe("messages.create");
    expect(event.status).toBe("failure");
    expect(event.error.message).toBe("provider failed");
    expect(event.usage.total_tokens).toBe(0);
  });
});
