import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTokveraLangChainCallback,
  TokveraLangChainCallbackHandler,
} from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("LangChain callback integration", () => {
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

  it("emits canonical success event on LLM end with normalized usage", async () => {
    const callback = createTokveraLangChainCallback({
      api_key: "project_key_123",
      feature: "agent_support",
      tenant_id: "acme",
      quality_label: "good",
      feedback_score: 5,
    });

    await callback.handleLLMStart(
      { kwargs: { model: "gpt-4o-mini" } },
      ["hello"],
      "run_100",
      undefined,
      { invocation_params: { model: "gpt-4o-mini" } },
      [],
      { conversation_id: "conv_100", step_name: "draft_reply" },
      "ReplyRun"
    );

    await callback.handleLLMEnd(
      {
        llmOutput: {
          tokenUsage: {
            promptTokens: 12,
            completionTokens: 7,
            totalTokens: 19,
          },
        },
      },
      "run_100"
    );
    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(init.headers.authorization).toBe("Bearer project_key_123");
    expect(event.provider).toBe("openai");
    expect(event.event_type).toBe("openai.request");
    expect(event.endpoint).toBe("chat.completions.create");
    expect(event.model).toBe("gpt-4o-mini");
    expect(event.status).toBe("success");
    expect(event.usage.prompt_tokens).toBe(12);
    expect(event.usage.completion_tokens).toBe(7);
    expect(event.usage.total_tokens).toBe(19);
    expect(event.tags.trace_id).toMatch(/^trc_/);
    expect(event.tags.span_id).toMatch(/^spn_/);
    expect(event.tags.run_id).toBe("run_100");
    expect(event.tags.conversation_id).toBe("conv_100");
    expect(event.tags.step_name).toBe("draft_reply");
    expect(event.tags.quality_label).toBe("good");
    expect(event.tags.feedback_score).toBe("5");
    expect(event.evaluation.feedback_score).toBe(5);
  });

  it("emits failure event and infers anthropic contract from model", async () => {
    const callback = new TokveraLangChainCallbackHandler({
      feature: "agent_support",
      tenant_id: "acme",
      model: "claude-3-5-sonnet-latest",
    });

    await callback.handleLLMStart(
      { kwargs: { model: "claude-3-5-sonnet-latest" } },
      ["hello"],
      "run_200"
    );
    await callback.handleLLMError(new Error("llm failure"), "run_200");
    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const event = JSON.parse(init.body);

    expect(event.provider).toBe("anthropic");
    expect(event.event_type).toBe("anthropic.request");
    expect(event.endpoint).toBe("messages.create");
    expect(event.status).toBe("failure");
    expect(event.error.message).toBe("llm failure");
    expect(event.usage.total_tokens).toBe(0);
    expect(event.tags.outcome).toBe("failure");
  });
});
