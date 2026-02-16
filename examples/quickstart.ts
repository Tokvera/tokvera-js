import OpenAI from "openai";
import { trackOpenAI } from "@tokvera/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tracked = trackOpenAI(openai, {
  feature: "demo",
  tenant_id: "tenant_001",
  customer_id: "cust_001",
  plan: "starter",
  environment: "local",
  template_id: "tmpl_001",
});

async function run() {
  const chat = await tracked.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say hello." }],
  });
  console.log("chat id:", chat.id);

  const response = await tracked.responses.create({
    model: "gpt-4o-mini",
    input: "Write a 1-sentence joke.",
  });
  console.log("response id:", response.id);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
