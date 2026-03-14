import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTokveraLangGraphHooks,
  createTokveraOpenAIAgentsTracingProcessor,
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
});
