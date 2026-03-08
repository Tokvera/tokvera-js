import { describe, expect, it } from "vitest";
import {
  createTokveraBackgroundJobContext,
  getTrackOptionsFromBackgroundJobContext,
} from "../src/index.js";

describe("background job context integration", () => {
  it("creates stable trace/run/root span context for a job", () => {
    const context = createTokveraBackgroundJobContext({
      job_id: "job_123",
      feature: "nightly_sync",
      tenant_id: "acme",
      environment: "production",
      conversation_id: "conv_job_123",
    });

    expect(context.job_id).toBe("job_123");
    expect(context.trace_id).toMatch(/^trc_/);
    expect(context.run_id).toMatch(/^run_/);
    expect(context.root_span_id).toMatch(/^spn_/);
    expect(context.base_track_options.feature).toBe("nightly_sync");
    expect(context.base_track_options.tenant_id).toBe("acme");
    expect(context.base_track_options.trace_id).toBe(context.trace_id);
    expect(context.base_track_options.run_id).toBe(context.run_id);
    expect(context.base_track_options.span_id).toBe(context.root_span_id);
  });

  it("builds child span options linked to job root span", () => {
    const context = createTokveraBackgroundJobContext({
      trace_id: "trc_batch_001",
      run_id: "run_batch_001",
      root_span_id: "spn_batch_root",
      feature: "billing_backfill",
      tenant_id: "acme",
    });

    const childOptions = getTrackOptionsFromBackgroundJobContext(context, {
      step_name: "aggregate_hourly",
      quality_label: "good",
      feedback_score: 4.2,
    });

    expect(childOptions.trace_id).toBe("trc_batch_001");
    expect(childOptions.run_id).toBe("run_batch_001");
    expect(childOptions.parent_span_id).toBe("spn_batch_root");
    expect(childOptions.step_name).toBe("aggregate_hourly");
    expect(childOptions.feature).toBe("billing_backfill");
    expect(childOptions.quality_label).toBe("good");
    expect(childOptions.feedback_score).toBe(4.2);
    expect(typeof childOptions.span_id).toBe("string");
    expect(childOptions.span_id).toMatch(/^spn_/);
    expect(childOptions.span_id).not.toBe("spn_batch_root");
  });
});

