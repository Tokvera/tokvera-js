import {
  createTokveraAutoGenHooks,
  createTokveraLiveKitHooks,
  createTokveraMastraHooks,
  createTokveraOpenAICompatibleGatewayHooks,
  createTokveraPipecatHooks,
  createTokveraTemporalHooks,
} from "../src/index.js";

const shared = {
  api_key: process.env.TOKVERA_API_KEY,
  tenant_id: "acme",
  environment: "production",
  emit_lifecycle_events: true,
};

async function runAutoGen() {
  const hooks = createTokveraAutoGenHooks({
    ...shared,
    feature: "autogen_chat",
  });
  const conversation = hooks.onConversationStart({ step_name: "autogen_conversation" });
  const agent = hooks.onAgentStart(conversation, { step_name: "planner_agent" });
  hooks.onAgentEnd(agent, { response: { next: "search_docs" } });
  hooks.onConversationEnd(conversation, { response: { status: "completed" } });
}

async function runMastra() {
  const hooks = createTokveraMastraHooks({
    ...shared,
    feature: "mastra_workflow",
  });
  const workflow = hooks.onWorkflowStart({ step_name: "mastra_workflow" });
  const step = hooks.onStepStart(workflow, { step_name: "search_docs" });
  hooks.onStepEnd(step, { response: { matches: 4 } });
  hooks.onWorkflowEnd(workflow, { response: { status: "completed" } });
}

async function runTemporal() {
  const hooks = createTokveraTemporalHooks({
    ...shared,
    feature: "temporal_workflow",
  });
  const workflow = hooks.onWorkflowStart({ step_name: "temporal_workflow" });
  const activity = hooks.onActivityStart(workflow, {
    step_name: "lookup_account",
    tool_name: "lookup_account",
  });
  hooks.onActivityEnd(activity, { response: { account_status: "active" } });
  hooks.onWorkflowEnd(workflow, { response: { status: "completed" } });
}

async function runPipecat() {
  const hooks = createTokveraPipecatHooks({
    ...shared,
    feature: "voice_pipeline",
    capture_content: true,
  });
  const turn = hooks.onTurnStart({ step_name: "voice_turn" });
  const transcript = hooks.onTranscriptionStart(turn, {
    step_name: "speech_to_text",
    provider: "openai",
    model: "gpt-4o-mini-transcribe",
  });
  hooks.onTranscriptionEnd(transcript, { response: { transcript: "Need account help" } });
  hooks.onTurnEnd(turn, { response: { status: "completed" } });
}

async function runLiveKit() {
  const hooks = createTokveraLiveKitHooks({
    ...shared,
    feature: "livekit_agent",
    capture_content: true,
  });
  const session = hooks.onSessionStart({ step_name: "livekit_room_session" });
  const turn = hooks.onTurnStart(session, {
    step_name: "voice_turn",
    provider: "openai",
    model: "gpt-4o-realtime-preview",
  });
  hooks.onTurnEnd(turn, { response: { transcript: "Upgrade my plan" } });
  hooks.onSessionEnd(session, { response: { status: "completed" } });
}

async function runGateway() {
  const hooks = createTokveraOpenAICompatibleGatewayHooks({
    ...shared,
    feature: "gateway_router",
  });
  const request = hooks.onRequestStart({ step_name: "gateway_request", model: "router" });
  const downstream = hooks.onDownstreamStart(request, {
    step_name: "downstream_provider_call",
    provider: "openai",
    model: "gpt-4o-mini",
  });
  hooks.onDownstreamEnd(downstream, {
    response: { output_text: "ok" },
    usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
  });
  hooks.onRequestEnd(request, { response: { status: "completed" } });
}

async function main() {
  await runAutoGen();
  await runMastra();
  await runTemporal();
  await runPipecat();
  await runLiveKit();
  await runGateway();
}

void main();
