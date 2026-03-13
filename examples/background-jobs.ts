import OpenAI from "openai";
import {
  createTokveraBackgroundJobContext,
  getTrackOptionsFromBackgroundJobContext,
  trackOpenAI,
} from "@tokvera/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runJob(): Promise<void> {
  const jobContext = createTokveraBackgroundJobContext({
    job_id: "job_daily_summary_001",
    feature: "daily_summary",
    tenant_id: "acme",
    environment: "production",
  });

  const trackedOpenAI = trackOpenAI(
    openai,
    getTrackOptionsFromBackgroundJobContext(jobContext, {
      api_key: process.env.TOKVERA_API_KEY,
      schema_version: "2026-04-01",
      span_kind: "orchestrator",
      step_name: "summarize_events",
      emitLifecycleEvents: true,
    })
  );

  await trackedOpenAI.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Summarize incidents from last 24h." }],
  });
}

runJob().catch((error) => {
  console.error(error);
  process.exit(1);
});
