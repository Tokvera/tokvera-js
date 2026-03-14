import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTokveraAutoGenHooks,
  createTokveraLangGraphHooks,
  createTokveraLiveKitHooks,
  createTokveraMastraHooks,
  createTokveraOpenAIAgentsTracingProcessor,
  createTokveraOpenAICompatibleGatewayHooks,
  createTokveraPipecatHooks,
  createTokveraTemporalHooks,
} from "../src/index.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("agent/runtime adapters", () => {
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

  it("emits OpenAI Agents lifecycle events with stable parent-child linkage", async () => {
    const processor = createTokveraOpenAIAgentsTracingProcessor({
      api_key: "project_key_123",
      feature: "agent_sdk",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
      capture_content: true,
    });

    const run = processor.onAgentStart({
      step_name: "support_agent",
      model: "agent-router",
    });
    const tool = processor.onToolStart(run, {
      step_name: "lookup_policy",
      tool_name: "lookup_policy",
      input: { policy_id: "p_100" },
    });
    processor.onToolEnd(tool, {
      response: { found: true },
    });
    const model = processor.onModelStart(run, {
      step_name: "draft_reply",
      provider: "openai",
      model: "gpt-4o-mini",
      input: { role: "user", content: "Help with billing" },
    });
    processor.onModelEnd(model, {
      response: { output_text: "Resolved." },
      usage: { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 },
    });
    processor.onAgentEnd(run, {
      response: { status: "completed" },
    });

    await flushPromises();

    expect((globalThis.fetch as any).mock.calls.length).toBe(6);
    const toolEnd = JSON.parse((globalThis.fetch as any).mock.calls[2][1].body);
    const modelEnd = JSON.parse((globalThis.fetch as any).mock.calls[4][1].body);

    expect(toolEnd.tags.trace_id).toBe(run.trace_id);
    expect(toolEnd.tags.parent_span_id).toBe(run.span_id);
    expect(toolEnd.span_kind).toBe("tool");
    expect(modelEnd.provider).toBe("openai");
    expect(modelEnd.endpoint).toBe("responses.create");
    expect(modelEnd.tags.trace_id).toBe(run.trace_id);
    expect(modelEnd.tags.parent_span_id).toBe(run.span_id);
    expect(modelEnd.span_kind).toBe("model");
    expect(modelEnd.usage.total_tokens).toBe(15);
  });

  it("emits LangGraph graph, node, and branch events", async () => {
    const hooks = createTokveraLangGraphHooks({
      api_key: "project_key_123",
      feature: "langgraph_workflow",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
      schema_version: "2026-04-01",
    });

    const graph = hooks.onGraphStart({
      step_name: "customer_journey_graph",
    });
    const node = hooks.onNodeStart(graph, {
      step_name: "planner",
      input: { question: "refund policy" },
    });
    hooks.onNodeEnd(node, {
      response: { next: "kb_search" },
    });
    const branch = hooks.onBranchStart(graph, {
      step_name: "route_branch",
      decision: { routing_reason: "policy_lookup", route: "kb_search" },
    });
    hooks.onBranchEnd(branch, {
      response: { route: "kb_search" },
    });
    hooks.onGraphEnd(graph, {
      response: { status: "completed" },
    });

    await flushPromises();

    expect((globalThis.fetch as any).mock.calls.length).toBe(6);
    const nodeEnd = JSON.parse((globalThis.fetch as any).mock.calls[2][1].body);
    const branchEnd = JSON.parse((globalThis.fetch as any).mock.calls[4][1].body);

    expect(nodeEnd.tags.trace_id).toBe(graph.trace_id);
    expect(nodeEnd.tags.parent_span_id).toBe(graph.span_id);
    expect(nodeEnd.tags.step_name).toBe("planner");
    expect(branchEnd.tags.step_name).toBe("route_branch");
    expect(branchEnd.decision.route).toBe("kb_search");
  });

  it.each([
    {
      label: "AutoGen conversation and agent",
      create: createTokveraAutoGenHooks,
      feature: "autogen_chat",
      startRoot: (hooks: ReturnType<typeof createTokveraAutoGenHooks>) =>
        hooks.onConversationStart({ step_name: "autogen_conversation" }),
      startChild: (
        hooks: ReturnType<typeof createTokveraAutoGenHooks>,
        root: ReturnType<ReturnType<typeof createTokveraAutoGenHooks>["onConversationStart"]>
      ) => hooks.onAgentStart(root, { step_name: "planner_agent" }),
      finishChild: (
        hooks: ReturnType<typeof createTokveraAutoGenHooks>,
        child: ReturnType<ReturnType<typeof createTokveraAutoGenHooks>["onAgentStart"]>
      ) => hooks.onAgentEnd(child, { response: { next: "search_docs" } }),
      finishRoot: (
        hooks: ReturnType<typeof createTokveraAutoGenHooks>,
        root: ReturnType<ReturnType<typeof createTokveraAutoGenHooks>["onConversationStart"]>
      ) => hooks.onConversationEnd(root, { response: { status: "completed" } }),
      expectedStep: "planner_agent",
      expectedKind: "orchestrator",
    },
    {
      label: "Mastra workflow and step",
      create: createTokveraMastraHooks,
      feature: "mastra_workflow",
      startRoot: (hooks: ReturnType<typeof createTokveraMastraHooks>) =>
        hooks.onWorkflowStart({ step_name: "mastra_workflow" }),
      startChild: (
        hooks: ReturnType<typeof createTokveraMastraHooks>,
        root: ReturnType<ReturnType<typeof createTokveraMastraHooks>["onWorkflowStart"]>
      ) => hooks.onStepStart(root, { step_name: "search_docs" }),
      finishChild: (
        hooks: ReturnType<typeof createTokveraMastraHooks>,
        child: ReturnType<ReturnType<typeof createTokveraMastraHooks>["onStepStart"]>
      ) => hooks.onStepEnd(child, { response: { matches: 4 } }),
      finishRoot: (
        hooks: ReturnType<typeof createTokveraMastraHooks>,
        root: ReturnType<ReturnType<typeof createTokveraMastraHooks>["onWorkflowStart"]>
      ) => hooks.onWorkflowEnd(root, { response: { status: "completed" } }),
      expectedStep: "search_docs",
      expectedKind: "orchestrator",
    },
    {
      label: "Temporal workflow and activity",
      create: createTokveraTemporalHooks,
      feature: "temporal_workflow",
      startRoot: (hooks: ReturnType<typeof createTokveraTemporalHooks>) =>
        hooks.onWorkflowStart({ step_name: "temporal_workflow" }),
      startChild: (
        hooks: ReturnType<typeof createTokveraTemporalHooks>,
        root: ReturnType<ReturnType<typeof createTokveraTemporalHooks>["onWorkflowStart"]>
      ) => hooks.onActivityStart(root, { step_name: "lookup_account", tool_name: "lookup_account" }),
      finishChild: (
        hooks: ReturnType<typeof createTokveraTemporalHooks>,
        child: ReturnType<ReturnType<typeof createTokveraTemporalHooks>["onActivityStart"]>
      ) => hooks.onActivityEnd(child, { response: { account_status: "active" } }),
      finishRoot: (
        hooks: ReturnType<typeof createTokveraTemporalHooks>,
        root: ReturnType<ReturnType<typeof createTokveraTemporalHooks>["onWorkflowStart"]>
      ) => hooks.onWorkflowEnd(root, { response: { status: "completed" } }),
      expectedStep: "lookup_account",
      expectedKind: "tool",
    },
    {
      label: "Pipecat turn and transcription",
      create: createTokveraPipecatHooks,
      feature: "voice_pipeline",
      startRoot: (hooks: ReturnType<typeof createTokveraPipecatHooks>) =>
        hooks.onTurnStart({ step_name: "voice_turn" }),
      startChild: (
        hooks: ReturnType<typeof createTokveraPipecatHooks>,
        root: ReturnType<ReturnType<typeof createTokveraPipecatHooks>["onTurnStart"]>
      ) =>
        hooks.onTranscriptionStart(root, {
          step_name: "speech_to_text",
          provider: "openai",
          model: "gpt-4o-mini-transcribe",
        }),
      finishChild: (
        hooks: ReturnType<typeof createTokveraPipecatHooks>,
        child: ReturnType<ReturnType<typeof createTokveraPipecatHooks>["onTranscriptionStart"]>
      ) => hooks.onTranscriptionEnd(child, { response: { transcript: "Need account help" } }),
      finishRoot: (
        hooks: ReturnType<typeof createTokveraPipecatHooks>,
        root: ReturnType<ReturnType<typeof createTokveraPipecatHooks>["onTurnStart"]>
      ) => hooks.onTurnEnd(root, { response: { status: "completed" } }),
      expectedStep: "speech_to_text",
      expectedKind: "model",
    },
    {
      label: "LiveKit session and turn",
      create: createTokveraLiveKitHooks,
      feature: "livekit_agent",
      startRoot: (hooks: ReturnType<typeof createTokveraLiveKitHooks>) =>
        hooks.onSessionStart({ step_name: "livekit_room_session" }),
      startChild: (
        hooks: ReturnType<typeof createTokveraLiveKitHooks>,
        root: ReturnType<ReturnType<typeof createTokveraLiveKitHooks>["onSessionStart"]>
      ) =>
        hooks.onTurnStart(root, {
          step_name: "voice_turn",
          provider: "openai",
          model: "gpt-4o-realtime-preview",
        }),
      finishChild: (
        hooks: ReturnType<typeof createTokveraLiveKitHooks>,
        child: ReturnType<ReturnType<typeof createTokveraLiveKitHooks>["onTurnStart"]>
      ) => hooks.onTurnEnd(child, { response: { transcript: "Upgrade my plan" } }),
      finishRoot: (
        hooks: ReturnType<typeof createTokveraLiveKitHooks>,
        root: ReturnType<ReturnType<typeof createTokveraLiveKitHooks>["onSessionStart"]>
      ) => hooks.onSessionEnd(root, { response: { status: "completed" } }),
      expectedStep: "voice_turn",
      expectedKind: "model",
    },
  ])("$label emits stable lifecycle linkage", async ({ create, feature, startRoot, startChild, finishChild, finishRoot, expectedStep, expectedKind }) => {
    const hooks = create({
      api_key: "project_key_123",
      feature,
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
    });

    const root = startRoot(hooks as never);
    const child = startChild(hooks as never, root as never);
    finishChild(hooks as never, child as never);
    finishRoot(hooks as never, root as never);

    await flushPromises();

    expect((globalThis.fetch as any).mock.calls.length).toBe(4);
    const childEnd = JSON.parse((globalThis.fetch as any).mock.calls[2][1].body);
    expect(childEnd.tags.trace_id).toBe(root.trace_id);
    expect(childEnd.tags.parent_span_id).toBe(root.span_id);
    expect(childEnd.tags.step_name).toBe(expectedStep);
    expect(childEnd.span_kind).toBe(expectedKind);
  });

  it("emits OpenAI-compatible gateway downstream and fallback spans", async () => {
    const hooks = createTokveraOpenAICompatibleGatewayHooks({
      api_key: "project_key_123",
      feature: "gateway_router",
      tenant_id: "tenant_1",
      emit_lifecycle_events: true,
    });

    const request = hooks.onRequestStart({
      step_name: "gateway_request",
      model: "router",
    });
    const downstream = hooks.onDownstreamStart(request, {
      step_name: "downstream_provider_call",
      provider: "openai",
      model: "gpt-4o-mini",
      input: { input: "Answer briefly." },
    });
    hooks.onDownstreamEnd(downstream, {
      response: { output_text: "ok" },
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    });
    const fallback = hooks.onFallbackStart(request, {
      step_name: "fallback_route",
      decision: { fallback_reason: "rate_limit", route: "anthropic" },
    });
    hooks.onFallbackEnd(fallback, {
      response: { route: "anthropic" },
    });
    hooks.onRequestEnd(request, {
      response: { status: "completed" },
    });

    await flushPromises();

    expect((globalThis.fetch as any).mock.calls.length).toBe(6);
    const downstreamEnd = JSON.parse((globalThis.fetch as any).mock.calls[2][1].body);
    const fallbackEnd = JSON.parse((globalThis.fetch as any).mock.calls[4][1].body);

    expect(downstreamEnd.provider).toBe("openai");
    expect(downstreamEnd.tags.parent_span_id).toBe(request.span_id);
    expect(downstreamEnd.span_kind).toBe("model");
    expect(downstreamEnd.usage.total_tokens).toBe(10);
    expect(fallbackEnd.tags.parent_span_id).toBe(request.span_id);
    expect(fallbackEnd.decision.route).toBe("anthropic");
  });
});
