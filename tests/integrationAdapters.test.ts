import { describe, expect, it, vi } from "vitest";
import {
  createTokveraBullMQJobContext,
  createTokveraNestMiddleware,
  createTokveraNextRouteContext,
  getTrackOptionsFromBullMQJobContext,
  getTrackOptionsFromNestExecutionContext,
  getTrackOptionsFromNextRouteContext,
} from "../src/index.js";

describe("framework adapter helpers", () => {
  it("builds Next.js route context and derives child track options", () => {
    const request: any = {
      method: "POST",
      nextUrl: { pathname: "/api/chat" },
      headers: {
        get(name: string) {
          const map: Record<string, string> = {
            "x-tokvera-trace-id": "trc_next_001",
            "x-tokvera-run-id": "run_next_001",
          };
          return map[name.toLowerCase()] ?? null;
        },
      },
    };

    const context = createTokveraNextRouteContext(request, {
      feature: "next_api",
      environment: "production",
    });
    expect(context.trace_id).toBe("trc_next_001");
    expect(context.run_id).toBe("run_next_001");
    expect(context.feature).toBe("next_api");
    expect(context.step_name).toBe("post /api/chat");

    const child = getTrackOptionsFromNextRouteContext(request, {
      step_name: "draft_reply",
    });
    expect(child.trace_id).toBe("trc_next_001");
    expect(child.parent_span_id).toBe(context.span_id);
    expect(child.step_name).toBe("draft_reply");
    expect(typeof child.span_id).toBe("string");
    expect(child.span_id).toMatch(/^spn_/);
  });

  it("supports NestJS middleware/interceptor style contexts", () => {
    const middleware = createTokveraNestMiddleware({
      feature: "nest_api",
      tenant_id: "tenant_nest",
    });

    const request: any = {
      method: "GET",
      path: "/v1/health",
      headers: {
        "x-tokvera-trace-id": "trc_nest_001",
      },
    };
    const response: any = { locals: {}, setHeader: vi.fn() };
    const next = vi.fn();
    middleware(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.tokvera.trace_id).toBe("trc_nest_001");
    expect(response.locals.tokvera.feature).toBe("nest_api");

    const executionContext: any = {
      switchToHttp() {
        return {
          getRequest() {
            return request;
          },
        };
      },
    };
    const child = getTrackOptionsFromNestExecutionContext(executionContext, {
      step_name: "controller_step",
    });
    expect(child.trace_id).toBe("trc_nest_001");
    expect(child.parent_span_id).toBe(request.tokvera.span_id);
    expect(child.step_name).toBe("controller_step");
  });

  it("creates BullMQ contexts with stable trace/run linkage", () => {
    const job: any = {
      id: "job_101",
      name: "sync_customer_usage",
      queueName: "usage_queue",
      attemptsMade: 1,
      opts: { attempts: 3 },
    };
    const context = createTokveraBullMQJobContext(job, {
      environment: "production",
      conversation_id: "conv_job_101",
    });

    expect(context.job_id).toBe("job_101");
    expect(context.trace_id).toMatch(/^trc_/);
    expect(context.run_id).toMatch(/^run_/);
    expect(context.base_track_options.feature).toBe("sync_customer_usage");
    expect(context.base_track_options.attempt_type).toBe("retry");

    const child = getTrackOptionsFromBullMQJobContext(context, {
      step_name: "worker_model_call",
    });
    expect(child.trace_id).toBe(context.trace_id);
    expect(child.run_id).toBe(context.run_id);
    expect(child.parent_span_id).toBe(context.root_span_id);
    expect(child.step_name).toBe("worker_model_call");
    expect(typeof child.span_id).toBe("string");
    expect(child.span_id).toMatch(/^spn_/);
  });
});

