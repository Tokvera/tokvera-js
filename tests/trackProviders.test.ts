import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackAnthropic, trackGemini } from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("additional provider tracking", () => {
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

  it("emits anthropic.request for messages.create", async () => {
    const response = {
      id: "msg_1",
      model: "claude-3-5-sonnet-latest",
      usage: {
        input_tokens: 12,
        output_tokens: 8,
      },
    };
    const anthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    };

    const tracked = trackAnthropic(anthropicClient, {
      feature: "support",
      tenant_id: "tenant_1",
    });

    const result = await tracked.messages.create({
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result).toBe(response);

    await flushPromises();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(event.provider).toBe("anthropic");
    expect(event.event_type).toBe("anthropic.request");
    expect(event.endpoint).toBe("messages.create");
    expect(event.usage.prompt_tokens).toBe(12);
    expect(event.usage.completion_tokens).toBe(8);
    expect(event.usage.total_tokens).toBe(20);
  });

  it("emits failure event for anthropic call errors and rethrows", async () => {
    const anthropicClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("anthropic failure")),
      },
    };

    const tracked = trackAnthropic(anthropicClient, { feature: "billing" });
    await expect(tracked.messages.create({ model: "claude-3-5-sonnet-latest" })).rejects.toThrow(
      "anthropic failure"
    );

    await flushPromises();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);
    expect(event.status).toBe("failure");
    expect(event.provider).toBe("anthropic");
    expect(event.endpoint).toBe("messages.create");
  });

  it("emits gemini.request for models.generateContent", async () => {
    const response = {
      modelVersion: "gemini-2.0-flash",
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 10,
        totalTokenCount: 30,
      },
    };
    const geminiClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue(response),
      },
    };

    const tracked = trackGemini(geminiClient, { feature: "chat" });
    const result = await tracked.models.generateContent?.({
      model: "gemini-2.0-flash",
      contents: "Hello",
    });

    expect(result).toBe(response);
    await flushPromises();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);
    expect(event.provider).toBe("gemini");
    expect(event.event_type).toBe("gemini.request");
    expect(event.endpoint).toBe("models.generate_content");
    expect(event.usage.total_tokens).toBe(30);
  });
});
