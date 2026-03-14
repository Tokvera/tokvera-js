import OpenAI from "openai";
import {
  createTokveraTracer,
  finishSpan,
  getTrackOptionsFromTraceContext,
  startSpan,
  startTrace,
  trackOpenAI,
} from "../src/index.js";

const tracer = createTokveraTracer({
  api_key: process.env.TOKVERA_API_KEY,
  feature: "custom_router",
  tenant_id: "acme",
  environment: "production",
  emit_lifecycle_events: true,
});

const root = startTrace(tracer.baseOptions, {
  step_name: "handle_request",
  model: "custom-router",
  span_kind: "orchestrator",
});

const classify = startSpan(root, {
  step_name: "classify_intent",
  provider: "openai",
  model: "gpt-4o-mini",
  span_kind: "model",
});

const trackedOpenAI = trackOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), {
  ...getTrackOptionsFromTraceContext(classify, {
    step_name: "classify_intent",
    span_kind: "model",
    capture_content: true,
  }),
});

async function main() {
  const result = await trackedOpenAI.responses.create({
    model: "gpt-4o-mini",
    input: "Classify this billing request.",
  });

  finishSpan(classify, { response: result, model: "gpt-4o-mini" });
  finishSpan(root, { response: { routed_to: "billing" } });
}

void main();
