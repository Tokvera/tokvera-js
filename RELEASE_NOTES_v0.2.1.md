# @tokvera/sdk v0.2.1

## Summary

This release adds Trace Context v1 support for better chain-level cost and performance analysis without storing prompt payloads.

## Added

- New optional tags in tracking options:
  - `trace_id`
  - `conversation_id`
  - `span_id`
  - `parent_span_id`
  - `step_name`

## Changed

- `trace_id` and `span_id` are auto-generated for each tracked call when not provided.

## Why it matters

You can now correlate model calls across multi-step workflows, retries, and conversation flows directly in Tokvera analytics.

## Upgrade

```bash
npm install @tokvera/sdk@0.2.1
```
