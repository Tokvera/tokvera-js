# Changelog

All notable changes to this project will be documented in this file.

## [0.2.3] - 2026-03-07

### Changed
- Ingestion now treats non-2xx API responses as failed deliveries instead of silently succeeding.
- Added retry classification for transient HTTP responses (`408`, `429`, `5xx`).
- Added warning logs with HTTP status/details when ingestion ultimately fails.

### Added
- Test coverage for non-2xx ingest handling and warning behavior.

## [0.2.2] - 2026-03-07

### Added
- Express middleware helpers: `createTokveraExpressMiddleware(...)` and `getTrackOptionsFromExpressRequest(...)`.
- LangChain callback integration via `createTokveraLangChainCallback(...)`.
- Vercel AI SDK helper via `wrapVercelAIGenerateText(...)`.
- Evaluation Signals v1 support in tags and top-level `evaluation` payload fields.

### Changed
- Expanded contract tests and integration tests for canonical envelope compatibility across framework helpers.

## [0.2.1] - 2026-03-04

### Added
- Trace Context v1 tag support in SDK options and emitted events.
- New optional tags: `trace_id`, `conversation_id`, `span_id`, `parent_span_id`, `step_name`.

### Changed
- Auto-generates `trace_id` and `span_id` per tracked call when not provided.

## [0.2.0] - 2026-03-02

### Added
- Anthropic tracking wrapper via `trackAnthropic(...)` for `messages.create`.
- Gemini tracking wrapper via `trackGemini(...)` for `models.generate_content`.
- Multi-provider event contracts aligned with Tokvera API schema.
- Provider-specific usage extraction for OpenAI, Anthropic, and Gemini responses.
- Test coverage for Anthropic/Gemini success and failure flows.

## [0.1.0] - 2026-02-16

### Added
- OpenAI request tracking wrapper for `chat.completions.create` and `responses.create`.
- Unified event schema with `schema_version`, `endpoint`, `status`, `usage`, and `tags`.
- Authenticated ingestion support via `api_key`/`apiKey` or `TOKVERA_API_KEY`.
- Ingestion URL override support via options or `TOKVERA_INGEST_URL`.
- Fire-and-forget ingestion retries with timeout and backoff.
- Test coverage for success/failure emissions and non-blocking behavior.
