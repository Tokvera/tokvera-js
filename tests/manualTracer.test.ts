import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTokveraOpenAICompatibleGatewayHooks,
  TokveraOTelSpanExporter,
  createTokveraTracer,
  finishSpan,
  getTrackOptionsFromTraceContext,
  startSpan,
  startTrace,
  trackOpenAI,
  trackMistral,
} from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("manual tracer substrate", () => {
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

  it("creates a root trace and child span with stable trace/run linkage", async () => {
    const tracer = createTokveraTracer({
      api_key: "project_key_123",
      feature: "support_router",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
    });

    const root = startTrace(tracer.baseOptions, {
      step_name: "handle_ticket",
      model: "custom-router",
      span_kind: "orchestrator",
    });
    const child = startSpan(root, {
      step_name: "draft_reply",
      provider: "tokvera",
      model: "tool-runner",
      span_kind: "tool",
    });

    const wrapperOptions = getTrackOptionsFromTraceContext(child, {
      step_name: "draft_reply_model",
      span_kind: "model",
    });

    finishSpan(child, {
      response: { ok: true },
    });
    finishSpan(root, {
      response: { completed: true },
    });

    await flushPromises();

    expect(root.trace_id).toMatch(/^trc_/);
    expect(child.trace_id).toBe(root.trace_id);
    expect(child.run_id).toBe(root.run_id);
    expect(child.parent_span_id).toBe(root.span_id);
    expect(wrapperOptions.trace_id).toBe(root.trace_id);
    expect(wrapperOptions.run_id).toBe(root.run_id);
    expect(wrapperOptions.parent_span_id).toBe(child.span_id);
    expect(wrapperOptions.span_id).toMatch(/^spn_/);

    const startEvent = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    const childStartEvent = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body);
    const childFinishEvent = JSON.parse((globalThis.fetch as any).mock.calls[2][1].body);

    expect(startEvent.provider).toBe("tokvera");
    expect(startEvent.event_type).toBe("tokvera.trace");
    expect(startEvent.endpoint).toBe("manual.trace");
    expect(startEvent.status).toBe("in_progress");
    expect(childStartEvent.endpoint).toBe("manual.span");
    expect(childFinishEvent.status).toBe("success");
    expect(childFinishEvent.tags.trace_id).toBe(root.trace_id);
  });

  it("tracks Mistral chat.complete on the canonical event contract", async () => {
    const response = {
      model: "mistral-small-latest",
      usage: {
        prompt_tokens: 9,
        completion_tokens: 6,
        total_tokens: 15,
      },
      choices: [{ message: { content: "Hello" } }],
    };
    const client = {
      chat: {
        complete: vi.fn().mockResolvedValue(response),
      },
    };

    const tracked = trackMistral(client, {
      feature: "reply",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
      capture_content: true,
    });

    await tracked.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: "Say hello" }],
    });
    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const terminalEvent = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body);
    expect(terminalEvent.provider).toBe("mistral");
    expect(terminalEvent.event_type).toBe("mistral.request");
    expect(terminalEvent.endpoint).toBe("chat.complete");
    expect(terminalEvent.usage.total_tokens).toBe(15);
  });

  it("bridges OpenTelemetry spans into Tokvera trace events", async () => {
    const exporter = new TokveraOTelSpanExporter({
      api_key: "project_key_123",
      feature: "otel_bridge",
      tenant_id: "tenant_1",
    });

    exporter.export(
      [
        {
          name: "planner",
          startTime: [1710378000, 0],
          endTime: [1710378000, 150_000_000],
          attributes: {
            "tokvera.provider": "openai",
            "tokvera.step_name": "planner",
            "gen_ai.response.model": "gpt-4o-mini",
            "gen_ai.usage.input_tokens": 12,
            "gen_ai.usage.output_tokens": 7,
          },
          spanContext() {
            return {
              traceId: "trc_otel_1",
              spanId: "spn_otel_1",
            };
          },
        },
      ],
      () => undefined
    );

    await flushPromises();
    const event = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(event.tags.trace_id).toBe("trc_otel_1");
    expect(event.provider).toBe("openai");
    expect(event.usage.total_tokens).toBe(19);
    expect(event.payload_blocks?.[0]?.payload_type).toBe("context");
  });

  it("does not double-emit when manual tracer composes with OpenAI wrapper", async () => {
    const response = {
      id: "resp_1",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 },
    };
    const openaiClient = {
      chat: { completions: { create: vi.fn() } },
      responses: { create: vi.fn().mockResolvedValue(response) },
    };

    const tracer = createTokveraTracer({
      api_key: "project_key_123",
      feature: "mixed_manual_openai",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
      capture_content: true,
    });

    const root = startTrace(tracer.baseOptions, {
      step_name: "gateway_request",
      model: "router",
      span_kind: "orchestrator",
    });
    const downstream = startSpan(root, {
      step_name: "downstream_provider_call",
      provider: "tokvera",
      model: "provider-router",
      span_kind: "model",
    });
    const tracked = trackOpenAI(openaiClient, {
      ...getTrackOptionsFromTraceContext(downstream, {
        step_name: "downstream_provider_call",
        span_kind: "model",
        provider: "openai",
        model: "gpt-4o-mini",
        emit_lifecycle_events: true,
        capture_content: true,
      }),
    });

    await tracked.responses.create({ model: "gpt-4o-mini", input: "Return a short answer." });
    finishSpan(downstream, { response: { status: "completed" } });
    finishSpan(root, { response: { status: "completed" } });

    await flushPromises();

    const events = (globalThis.fetch as any).mock.calls.map((call: any) => JSON.parse(call[1].body));
    expect(events).toHaveLength(6);

    const keys = new Set(events.map((event: any) => `${event.tags.trace_id}:${event.tags.span_id}:${event.status}`));
    expect(keys.size).toBe(events.length);

    const spanIds = new Set(events.map((event: any) => event.tags.span_id));
    expect(spanIds.size).toBe(3);

    const terminalProviderEvent = events.find((event: any) => event.provider === "openai" && event.status === "success");
    expect(terminalProviderEvent.tags.parent_span_id).toBe(downstream.span_id);
    expect(terminalProviderEvent.tags.trace_id).toBe(root.trace_id);
  });

  it("keeps gateway helper, provider wrapper, and fallback branch under one trace without duplicate status events", async () => {
    const response = {
      id: "resp_2",
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    };
    const openaiClient = {
      chat: { completions: { create: vi.fn() } },
      responses: { create: vi.fn().mockResolvedValue(response) },
    };
    const gateway = createTokveraOpenAICompatibleGatewayHooks({
      api_key: "project_key_123",
      feature: "gateway_composition",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
      capture_content: true,
    });

    const request = gateway.onRequestStart({ step_name: "gateway_request", model: "router" });
    const downstream = gateway.onDownstreamStart(request, {
      step_name: "downstream_provider_call",
      provider: "tokvera",
      model: "provider-router",
    });
    const tracked = trackOpenAI(openaiClient, {
      ...gateway.getTrackOptionsFromTraceContext(downstream, {
        step_name: "downstream_provider_call",
        span_kind: "model",
        provider: "openai",
        model: "gpt-4o-mini",
        emit_lifecycle_events: true,
      }),
    });

    await tracked.responses.create({ model: "gpt-4o-mini", input: "Return a short answer." });
    gateway.onDownstreamEnd(downstream, { response: { output_text: "ok" } });
    const fallback = gateway.onFallbackStart(request, {
      step_name: "fallback_route",
      decision: { fallback_reason: "rate_limit", route: "anthropic" },
    });
    gateway.onFallbackEnd(fallback, { response: { route: "anthropic" } });
    gateway.onRequestEnd(request, { response: { status: "completed" } });

    await flushPromises();

    const events = (globalThis.fetch as any).mock.calls.map((call: any) => JSON.parse(call[1].body));
    const keys = new Set(events.map((event: any) => `${event.tags.trace_id}:${event.tags.span_id}:${event.status}`));
    expect(keys.size).toBe(events.length);

    const traceIds = new Set(events.map((event: any) => event.tags.trace_id));
    expect(traceIds.size).toBe(1);
    const terminalFallback = events.find((event: any) => event.tags.step_name === "fallback_route" && event.status === "success");
    expect(terminalFallback.decision.route).toBe("anthropic");
  });
});
