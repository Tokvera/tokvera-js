const DEFAULT_BASE_URL = "https://api.tokvera.org";

const EXPECTED_V1 = {
  envelope_version: "v1",
  schema_version: "2026-02-16",
  optional_top_level_fields: ["prompt_hash", "response_hash", "error", "evaluation"],
};

const EXPECTED_V2 = {
  envelope_version: "v2",
  schema_version: "2026-04-01",
  optional_top_level_fields: [
    "prompt_hash",
    "response_hash",
    "error",
    "evaluation",
    "span_kind",
    "tool_name",
    "payload_refs",
    "payload_blocks",
    "metrics",
    "decision",
  ],
  span_kinds: ["model", "tool", "orchestrator", "retrieval", "guardrail"],
  payload_types: ["prompt_input", "tool_input", "tool_output", "model_output", "context", "other"],
  metrics_fields: ["prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "cost_usd"],
  decision_fields: ["outcome", "retry_reason", "fallback_reason", "routing_reason", "route"],
};

const REQUIRED_TOP_LEVEL_FIELDS = [
  "schema_version",
  "event_type",
  "provider",
  "endpoint",
  "status",
  "timestamp",
  "latency_ms",
  "model",
  "usage",
  "tags",
];

const STATUS_VALUES = ["in_progress", "success", "failure"];
const PROVIDER_CONTRACTS = {
  openai: {
    event_type: "openai.request",
    endpoints: ["chat.completions.create", "responses.create"],
  },
  anthropic: {
    event_type: "anthropic.request",
    endpoints: ["messages.create"],
  },
  gemini: {
    event_type: "gemini.request",
    endpoints: ["models.generate_content"],
  },
  mistral: {
    event_type: "mistral.request",
    endpoints: ["chat.complete"],
  },
  tokvera: {
    event_type: "tokvera.trace",
    endpoints: ["manual.trace", "manual.span", "otel.span"],
  },
};
const USAGE_FIELDS = ["prompt_tokens", "completion_tokens", "total_tokens"];
const ERROR_FIELDS = ["type", "message"];
const ALLOWED_TAG_FIELDS = [
  "feature",
  "tenant_id",
  "customer_id",
  "attempt_type",
  "plan",
  "environment",
  "template_id",
  "trace_id",
  "run_id",
  "conversation_id",
  "span_id",
  "parent_span_id",
  "step_name",
  "outcome",
  "retry_reason",
  "fallback_reason",
  "quality_label",
  "feedback_score",
];
const EVALUATION_FIELDS = [
  "outcome",
  "retry_reason",
  "fallback_reason",
  "quality_label",
  "feedback_score",
];

const STRICT_VALIDATION = {
  allow_unknown_top_level_fields: false,
  allow_unknown_usage_fields: false,
  allow_unknown_tag_fields: false,
  allow_unknown_evaluation_fields: false,
  allow_unknown_error_fields: false,
};

const COMPATIBILITY_POLICY = {
  additive_optional_fields: true,
  required_fields_require_schema_bump: true,
  semantic_changes_require_schema_bump: true,
  deprecations_require_staged_rollout: true,
};

const VALIDATION_ERROR_CODES_V1 = [
  "MISSING_FIELD",
  "UNSUPPORTED_VERSION",
  "UNSUPPORTED_EVENT_TYPE",
  "INVALID_SCHEMA",
  "UNKNOWN_TOP_LEVEL_FIELD",
  "UNKNOWN_USAGE_FIELD",
  "UNKNOWN_TAG_FIELD",
  "UNKNOWN_EVALUATION_FIELD",
  "UNKNOWN_ERROR_FIELD",
];

const VALIDATION_ERROR_CODES_V2 = [
  ...VALIDATION_ERROR_CODES_V1,
  "UNKNOWN_METRICS_FIELD",
  "UNKNOWN_DECISION_FIELD",
];

function asSortedSet(values) {
  return [...new Set(values)].sort();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch. expected=${expected} actual=${actual}`);
  }
}

function assertSetEqual(actual, expected, label) {
  const actualSorted = asSortedSet(actual || []);
  const expectedSorted = asSortedSet(expected || []);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label} mismatch.\nexpected=${JSON.stringify(expectedSorted)}\nactual=${JSON.stringify(actualSorted)}`
    );
  }
}

async function fetchSchema(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Canonical contract request failed with HTTP ${response.status}. url=${url} body=${body.slice(0, 512)}`
    );
  }
  const payload = await response.json();
  if (!payload?.ok || !payload?.schema || typeof payload.schema !== "object") {
    throw new Error(`Canonical contract response payload format is invalid. url=${url}`);
  }
  return payload.schema;
}

function assertCommonSchemaShape(schema, { v2 = false } = {}) {
  assertSetEqual(
    schema.required_top_level_fields || [],
    REQUIRED_TOP_LEVEL_FIELDS,
    "required_top_level_fields"
  );
  assertSetEqual(schema.status_values || [], STATUS_VALUES, "status_values");
  assertSetEqual(schema.usage_fields || [], USAGE_FIELDS, "usage_fields");
  assertSetEqual(schema.error_fields || [], ERROR_FIELDS, "error_fields");
  assertSetEqual(schema.allowed_tag_fields || [], ALLOWED_TAG_FIELDS, "allowed_tag_fields");
  assertSetEqual(schema.evaluation_fields || [], EVALUATION_FIELDS, "evaluation_fields");
  assertSetEqual(
    schema.validation_error_codes || [],
    v2 ? VALIDATION_ERROR_CODES_V2 : VALIDATION_ERROR_CODES_V1,
    "validation_error_codes"
  );

  if (schema.strict_validation && typeof schema.strict_validation === "object") {
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_top_level_fields),
      STRICT_VALIDATION.allow_unknown_top_level_fields,
      "strict_validation.allow_unknown_top_level_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_usage_fields),
      STRICT_VALIDATION.allow_unknown_usage_fields,
      "strict_validation.allow_unknown_usage_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_tag_fields),
      STRICT_VALIDATION.allow_unknown_tag_fields,
      "strict_validation.allow_unknown_tag_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_evaluation_fields),
      STRICT_VALIDATION.allow_unknown_evaluation_fields,
      "strict_validation.allow_unknown_evaluation_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_error_fields),
      STRICT_VALIDATION.allow_unknown_error_fields,
      "strict_validation.allow_unknown_error_fields"
    );
  }

  assertEqual(
    Boolean(schema.compatibility_policy?.additive_optional_fields),
    COMPATIBILITY_POLICY.additive_optional_fields,
    "compatibility_policy.additive_optional_fields"
  );
  assertEqual(
    Boolean(schema.compatibility_policy?.required_fields_require_schema_bump),
    COMPATIBILITY_POLICY.required_fields_require_schema_bump,
    "compatibility_policy.required_fields_require_schema_bump"
  );
  assertEqual(
    Boolean(schema.compatibility_policy?.semantic_changes_require_schema_bump),
    COMPATIBILITY_POLICY.semantic_changes_require_schema_bump,
    "compatibility_policy.semantic_changes_require_schema_bump"
  );
  assertEqual(
    Boolean(schema.compatibility_policy?.deprecations_require_staged_rollout),
    COMPATIBILITY_POLICY.deprecations_require_staged_rollout,
    "compatibility_policy.deprecations_require_staged_rollout"
  );

  for (const [provider, expectedContract] of Object.entries(PROVIDER_CONTRACTS)) {
    const actualContract = schema.provider_contracts?.[provider];
    if (!actualContract) {
      throw new Error(`provider_contracts.${provider} is missing from canonical schema.`);
    }
    assertEqual(
      actualContract.event_type,
      expectedContract.event_type,
      `provider_contracts.${provider}.event_type`
    );
    assertSetEqual(
      actualContract.endpoints || [],
      expectedContract.endpoints,
      `provider_contracts.${provider}.endpoints`
    );
  }
}

function assertV1Schema(schema) {
  assertEqual(schema.envelope_version, EXPECTED_V1.envelope_version, "envelope_version");
  assertEqual(schema.schema_version, EXPECTED_V1.schema_version, "schema_version");
  assertSetEqual(
    schema.optional_top_level_fields || [],
    EXPECTED_V1.optional_top_level_fields,
    "optional_top_level_fields"
  );
  assertCommonSchemaShape(schema, { v2: false });
}

function assertV2Schema(schema) {
  assertEqual(schema.envelope_version, EXPECTED_V2.envelope_version, "envelope_version");
  assertEqual(schema.schema_version, EXPECTED_V2.schema_version, "schema_version");
  assertSetEqual(
    schema.optional_top_level_fields || [],
    EXPECTED_V2.optional_top_level_fields,
    "optional_top_level_fields"
  );
  assertSetEqual(schema.span_kinds || [], EXPECTED_V2.span_kinds, "span_kinds");
  assertSetEqual(schema.payload_types || [], EXPECTED_V2.payload_types, "payload_types");
  assertSetEqual(schema.metrics_fields || [], EXPECTED_V2.metrics_fields, "metrics_fields");
  assertSetEqual(schema.decision_fields || [], EXPECTED_V2.decision_fields, "decision_fields");
  assertCommonSchemaShape(schema, { v2: true });
}

async function main() {
  const singleUrl = process.env.TOKVERA_CANONICAL_SCHEMA_URL;
  if (singleUrl) {
    const schema = await fetchSchema(singleUrl);
    if (schema?.schema_version === EXPECTED_V2.schema_version) {
      assertV2Schema(schema);
      console.log(`Canonical v2 envelope contract check passed. URL: ${singleUrl}`);
      return;
    }
    assertV1Schema(schema);
    console.log(`Canonical v1 envelope contract check passed. URL: ${singleUrl}`);
    return;
  }

  const baseUrl = process.env.TOKVERA_API_BASE_URL || DEFAULT_BASE_URL;
  const v1Url = `${baseUrl.replace(/\/$/, "")}/v1/schema/event-envelope-v1`;
  const v1Schema = await fetchSchema(v1Url);
  assertV1Schema(v1Schema);

  const shouldCheckV2 = process.env.TOKVERA_CHECK_V2_CONTRACT === "1";
  if (!shouldCheckV2) {
    console.log("Canonical v1 envelope contract check passed.");
    console.log(`Checked URL: ${v1Url}`);
    console.log("Set TOKVERA_CHECK_V2_CONTRACT=1 to also validate v2 endpoint.");
    return;
  }

  const v2Url = `${baseUrl.replace(/\/$/, "")}/v1/schema/event-envelope-v2`;
  const v2Schema = await fetchSchema(v2Url);
  assertV2Schema(v2Schema);

  console.log("Canonical envelope contract checks passed for v1 and v2.");
  console.log(`Checked URLs: ${v1Url} | ${v2Url}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
