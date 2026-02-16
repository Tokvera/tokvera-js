# Release Runbook

## Prerequisites

- `npm` account with publish access to `@tokvera/sdk`.
- Repository secret `NPM_TOKEN` set in GitHub Actions.
- Clean `main` branch with passing CI.

## Pre-release checklist

1. Confirm `package.json` version matches target release.
2. Run:
   - `npm ci`
   - `npm run build`
   - `npm test`
3. Update `CHANGELOG.md` with release date and notes.

## Release steps

1. Commit release changes.
2. Create and push a version tag:
   - `git tag v0.1.0`
   - `git push origin v0.1.0`
3. Wait for `Publish` workflow to complete.
4. Verify package on npm.

## Rollback

- If publish fails before package release: fix and re-tag with next patch version.
- If package is published with issues: publish a patch release (`0.1.1`) with fixes.
