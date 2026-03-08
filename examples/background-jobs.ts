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
      step_name: "summarize_events",
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
