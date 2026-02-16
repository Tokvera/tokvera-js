# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-16

### Added
- OpenAI request tracking wrapper for `chat.completions.create` and `responses.create`.
- Unified event schema with `schema_version`, `endpoint`, `status`, `usage`, and `tags`.
- Authenticated ingestion support via `api_key`/`apiKey` or `TOKVERA_API_KEY`.
- Ingestion URL override support via options or `TOKVERA_INGEST_URL`.
- Fire-and-forget ingestion retries with timeout and backoff.
- Test coverage for success/failure emissions and non-blocking behavior.
