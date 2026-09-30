---
id: BACK-716
title: Define native Elysia typed JSON schemas for browser routes
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-09-30 14:52'
updated_date: '2026-09-30 15:21'
labels: []
dependencies: []
type: chore
ordinal: 350000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser route contracts need native Elysia schemas so request and JSON response types are declared at the HTTP boundary rather than inferred through untyped adapters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Affected browser routes declare native Elysia request and JSON response schemas
- [ ] #2 Route handlers type-check against their declared schemas without compatibility forwarding adapters
- [ ] #3 Endpoint tests cover representative valid JSON responses and schema-rejected input where applicable
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review collection query, scope, error, and mutation hooks against Elysia response conventions. 2. Replace owned browser route Response.json usage with typed native schemas and plain values/statuses. 3. Run focused server route tests and type/check verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Converted every task route to native Elysia request/response schemas and plain/status responses; added non-object task mutation validation coverage. Isolated task endpoint tests are blocked at module load by the concurrent errors.ts import of non-exported TaskCollectionFilterError.

Implemented native response/request schemas for project, milestones, documents, decisions, and search; converted owned Response.json routes to plain values with set.status; scope errors now use the same contract. Verified tsc, Biome, init/statistics/document/milestone/scope focused tests. server-search-endpoint remains blocked by the concurrently owned task route schema dropping task summary/detail fields (400 task reads).

Corrected task summary/detail schemas, endpoint-specific typed task mutation inputs, response-validation 500 handling, and milestone DELETE array-body preservation. Verified tsc, focused Biome, server detail/search/collection/mutation tests. server-runtime-scope remains independently failing its malformed-config watcher notification assertion under concurrent work.
<!-- SECTION:NOTES:END -->
