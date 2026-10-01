---
task_schema_version: 2
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
description: >-
  Browser route contracts need native Elysia schemas so request and JSON
  response types are declared at the HTTP boundary rather than inferred through
  untyped adapters.
implementation_plan: >-
  1. Review collection query, scope, error, and mutation hooks against Elysia
  response conventions. 2. Replace owned browser route Response.json usage with
  typed native schemas and plain values/statuses. 3. Run focused server route
  tests and type/check verification.
implementation_notes: >-
  Converted every task route to native Elysia request/response schemas and
  plain/status responses; added non-object task mutation validation coverage.
  Isolated task endpoint tests are blocked at module load by the concurrent
  errors.ts import of non-exported TaskCollectionFilterError.


  Implemented native response/request schemas for project, milestones,
  documents, decisions, and search; converted owned Response.json routes to
  plain values with set.status; scope errors now use the same contract. Verified
  tsc, Biome, init/statistics/document/milestone/scope focused tests.
  server-search-endpoint remains blocked by the concurrently owned task route
  schema dropping task summary/detail fields (400 task reads).


  Corrected task summary/detail schemas, endpoint-specific typed task mutation
  inputs, response-validation 500 handling, and milestone DELETE array-body
  preservation. Verified tsc, focused Biome, server
  detail/search/collection/mutation tests. server-runtime-scope remains
  independently failing its malformed-config watcher notification assertion
  under concurrent work.
acceptance_criteria:
  - index: 1
    text: >-
      Affected browser routes declare native Elysia request and JSON response
      schemas
    checked: false
  - index: 2
    text: >-
      Route handlers type-check against their declared schemas without
      compatibility forwarding adapters
    checked: false
  - index: 3
    text: >-
      Endpoint tests cover representative valid JSON responses and
      schema-rejected input where applicable
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
