import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackOpenAI } from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("trackOpenAI", () => {
  const originalEnv = process.env.TOKVERA_INGEST_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    process.env.TOKVERA_INGEST_URL = "https://ingest.example.test";
  });

  afterEach(() => {
    process.env.TOKVERA_INGEST_URL = originalEnv;
  });

  it("proxies chat.completions.create and emits an event", async () => {
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

    const tracked = trackOpenAI(openaiClient, { feature: "checkout" });
    const result = await tracked.chat.completions.create({ messages: [] });

    expect(result).toBe(response);
    expect(openaiClient.chat.completions.create).toHaveBeenCalledOnce();

    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);
    expect(event.endpoint).toBe("chat.completions.create");
    expect(event.usage.total_tokens).toBe(8);
    expect(event.tags.feature).toBe("checkout");
  });

  it("proxies responses.create and emits an event", async () => {
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
    expect(event.endpoint).toBe("responses.create");
    expect(event.usage.completion_tokens).toBe(4);
    expect(event.tags.environment).toBe("test");
  });

  it("does not emit when TOKVERA_INGEST_URL is not set", async () => {
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
});
