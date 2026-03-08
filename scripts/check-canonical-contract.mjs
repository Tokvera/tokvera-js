const DEFAULT_CONTRACT_URL = "https://api.tokvera.org/v1/schema/event-envelope-v1";

const EXPECTED = {
  envelope_version: "v1",
  schema_version: "2026-02-16",
  required_top_level_fields: [
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
  ],
  optional_top_level_fields: ["prompt_hash", "response_hash", "error", "evaluation"],
  strict_validation: {
    allow_unknown_top_level_fields: false,
    allow_unknown_usage_fields: false,
    allow_unknown_tag_fields: false,
    allow_unknown_evaluation_fields: false,
    allow_unknown_error_fields: false,
  },
  validation_error_codes: [
    "MISSING_FIELD",
    "UNSUPPORTED_VERSION",
    "UNSUPPORTED_EVENT_TYPE",
    "INVALID_SCHEMA",
    "UNKNOWN_TOP_LEVEL_FIELD",
    "UNKNOWN_USAGE_FIELD",
    "UNKNOWN_TAG_FIELD",
    "UNKNOWN_EVALUATION_FIELD",
    "UNKNOWN_ERROR_FIELD",
  ],
  status_values: ["success", "failure"],
  provider_contracts: {
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
  },
  usage_fields: ["prompt_tokens", "completion_tokens", "total_tokens"],
  error_fields: ["type", "message"],
  allowed_tag_fields: [
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
  ],
  evaluation_fields: [
    "outcome",
    "retry_reason",
    "fallback_reason",
    "quality_label",
    "feedback_score",
  ],
  compatibility_policy: {
    additive_optional_fields: true,
    required_fields_require_schema_bump: true,
    semantic_changes_require_schema_bump: true,
    deprecations_require_staged_rollout: true,
  },
};

function asSortedSet(values) {
  return [...new Set(values)].sort();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch. expected=${expected} actual=${actual}`);
  }
}

function assertSetEqual(actual, expected, label) {
  const actualSorted = asSortedSet(actual);
  const expectedSorted = asSortedSet(expected);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label} mismatch.\nexpected=${JSON.stringify(expectedSorted)}\nactual=${JSON.stringify(actualSorted)}`
    );
  }
}

async function main() {
  const url = process.env.TOKVERA_CANONICAL_SCHEMA_URL || DEFAULT_CONTRACT_URL;
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Canonical contract request failed with HTTP ${response.status}. body=${body.slice(0, 512)}`
    );
  }

  const payload = await response.json();
  if (!payload?.ok || !payload?.schema || typeof payload.schema !== "object") {
    throw new Error("Canonical contract response payload format is invalid.");
  }

  const schema = payload.schema;

  assertEqual(schema.envelope_version, EXPECTED.envelope_version, "envelope_version");
  assertEqual(schema.schema_version, EXPECTED.schema_version, "schema_version");
  assertSetEqual(schema.required_top_level_fields || [], EXPECTED.required_top_level_fields, "required_top_level_fields");
  assertSetEqual(schema.optional_top_level_fields || [], EXPECTED.optional_top_level_fields, "optional_top_level_fields");
  if (schema.strict_validation && typeof schema.strict_validation === "object") {
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_top_level_fields),
      EXPECTED.strict_validation.allow_unknown_top_level_fields,
      "strict_validation.allow_unknown_top_level_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_usage_fields),
      EXPECTED.strict_validation.allow_unknown_usage_fields,
      "strict_validation.allow_unknown_usage_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_tag_fields),
      EXPECTED.strict_validation.allow_unknown_tag_fields,
      "strict_validation.allow_unknown_tag_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_evaluation_fields),
      EXPECTED.strict_validation.allow_unknown_evaluation_fields,
      "strict_validation.allow_unknown_evaluation_fields"
    );
    assertEqual(
      Boolean(schema.strict_validation?.allow_unknown_error_fields),
      EXPECTED.strict_validation.allow_unknown_error_fields,
      "strict_validation.allow_unknown_error_fields"
    );
  }
  if (Array.isArray(schema.validation_error_codes)) {
    assertSetEqual(schema.validation_error_codes, EXPECTED.validation_error_codes, "validation_error_codes");
  }
  assertSetEqual(schema.status_values || [], EXPECTED.status_values, "status_values");
  assertSetEqual(schema.usage_fields || [], EXPECTED.usage_fields, "usage_fields");
  if (Array.isArray(schema.error_fields)) {
    assertSetEqual(schema.error_fields, EXPECTED.error_fields, "error_fields");
  }
  assertSetEqual(schema.allowed_tag_fields || [], EXPECTED.allowed_tag_fields, "allowed_tag_fields");
  assertSetEqual(schema.evaluation_fields || [], EXPECTED.evaluation_fields, "evaluation_fields");
  assertEqual(
    Boolean(schema.compatibility_policy?.additive_optional_fields),
    EXPECTED.compatibility_policy.additive_optional_fields,
    "compatibility_policy.additive_optional_fields"
  );
  assertEqual(
    Boolean(schema.compatibility_policy?.required_fields_require_schema_bump),
    EXPECTED.compatibility_policy.required_fields_require_schema_bump,
    "compatibility_policy.required_fields_require_schema_bump"
  );
  assertEqual(
    Boolean(schema.compatibility_policy?.semantic_changes_require_schema_bump),
    EXPECTED.compatibility_policy.semantic_changes_require_schema_bump,
    "compatibility_policy.semantic_changes_require_schema_bump"
  );
  assertEqual(
    Boolean(schema.compatibility_policy?.deprecations_require_staged_rollout),
    EXPECTED.compatibility_policy.deprecations_require_staged_rollout,
    "compatibility_policy.deprecations_require_staged_rollout"
  );

  for (const [provider, expectedContract] of Object.entries(EXPECTED.provider_contracts)) {
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

  console.log("Canonical envelope contract check passed.");
  console.log(`Checked URL: ${url}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
