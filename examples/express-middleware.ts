import express from "express";
import OpenAI from "openai";
import {
  createTokveraExpressMiddleware,
  getTrackOptionsFromExpressRequest,
  trackOpenAI,
} from "@tokvera/sdk";

type UserContext = {
  tenantId?: string;
  customerId?: string;
  plan?: string;
};

type RequestWithUser = express.Request & {
  user?: UserContext;
};

const app = express();
app.use(express.json());

// Demo auth context injection.
app.use((req: RequestWithUser, _res, next) => {
  req.user = {
    tenantId: "acme",
    customerId: "cust_42",
    plan: "pro",
  };
  next();
});

app.use(
  createTokveraExpressMiddleware({
    feature: "support_chat",
    environment: "production",
    tenant_id: (req) => (req as RequestWithUser).user?.tenantId,
    customer_id: (req) => (req as RequestWithUser).user?.customerId,
    plan: (req) => (req as RequestWithUser).user?.plan,
  })
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/reply", async (req: RequestWithUser, res, next) => {
  try {
    const trackedOpenAI = trackOpenAI(
      openai,
      getTrackOptionsFromExpressRequest(req, {
        api_key: process.env.TOKVERA_API_KEY,
        step_name: "draft_reply",
        quality_label: "good",
        outcome: "success",
        emitLifecycleEvents: true,
      })
    );

    const prompt = String(req.body?.prompt || "Say hello in one sentence.");
    const completion = await trackedOpenAI.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    res.json({
      trace_id: req.tokvera?.trace_id,
      run_id: req.tokvera?.run_id,
      answer: completion.choices[0]?.message?.content ?? "",
    });
  } catch (error) {
    next(error);
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Express example listening on :${port}`);
});
