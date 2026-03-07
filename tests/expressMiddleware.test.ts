import { describe, expect, it, vi } from "vitest";
import {
  createTokveraExpressMiddleware,
  getTrackOptionsFromExpressRequest,
} from "../src/index.js";

describe("express middleware integration", () => {
  it("creates per-request trace context and exposes it on request + response locals", () => {
    const middleware = createTokveraExpressMiddleware({
      feature: "support_bot",
      tenant_id: (request) => {
        const user = request.user as { tenantId?: string } | undefined;
        return user?.tenantId;
      },
      outcome: "success",
      retry_reason: "none",
      fallback_reason: "none",
      quality_label: "good",
      feedback_score: 4,
    });

    const request: any = {
      headers: {
        "x-tokvera-trace-id": "trc_req_100",
        "x-tokvera-run-id": "run_req_100",
      },
      method: "POST",
      path: "/chat/reply",
      user: { tenantId: "acme" },
    };

    const response: any = {
      locals: {},
      setHeader: vi.fn(),
    };

    const next = vi.fn();
    middleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.tokvera.trace_id).toBe("trc_req_100");
    expect(request.tokvera.run_id).toBe("run_req_100");
    expect(request.tokvera.feature).toBe("support_bot");
    expect(request.tokvera.tenant_id).toBe("acme");
    expect(request.tokvera.step_name).toBe("post /chat/reply");
    expect(request.tokvera.feedback_score).toBe(4);
    expect(response.locals.tokvera.trace_id).toBe("trc_req_100");
    expect(response.setHeader).toHaveBeenCalledWith("x-tokvera-trace-id", "trc_req_100");
  });

  it("builds child track options and links parent span from request context", () => {
    const request: any = {
      tokvera: {
        trace_id: "trc_req_200",
        run_id: "run_req_200",
        span_id: "spn_request_200",
        feature: "assistant",
      },
    };

    const options = getTrackOptionsFromExpressRequest(request, {
      step_name: "draft_reply",
      quality_label: "poor",
      feedback_score: 2,
    });

    expect(options.trace_id).toBe("trc_req_200");
    expect(options.run_id).toBe("run_req_200");
    expect(options.parent_span_id).toBe("spn_request_200");
    expect(options.step_name).toBe("draft_reply");
    expect(options.quality_label).toBe("poor");
    expect(options.feedback_score).toBe(2);
    expect(typeof options.span_id).toBe("string");
    expect(options.span_id).toMatch(/^spn_/);
    expect(options.span_id).not.toBe("spn_request_200");
  });
});
