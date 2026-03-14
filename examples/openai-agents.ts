import { createTokveraOpenAIAgentsTracingProcessor } from "../src/index.js";

const processor = createTokveraOpenAIAgentsTracingProcessor({
  api_key: process.env.TOKVERA_API_KEY,
  feature: "agent_sdk",
  tenant_id: "acme",
  environment: "production",
  emit_lifecycle_events: true,
});

async function main() {
  const run = processor.onAgentStart({
    step_name: "support_agent",
    model: "agent-router",
  });

  const tool = processor.onToolStart(run, {
    step_name: "lookup_policy",
    tool_name: "lookup_policy",
    input: { policy_id: "p_100" },
  });
  processor.onToolEnd(tool, { response: { found: true } });

  const model = processor.onModelStart(run, {
    step_name: "draft_reply",
    provider: "openai",
    model: "gpt-4o-mini",
    input: { role: "user", content: "How do refunds work?" },
  });
  processor.onModelEnd(model, {
    response: { output_text: "Refunds follow the 30-day policy." },
    usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
  });

  processor.onAgentEnd(run, { response: { status: "completed" } });
}

void main();
