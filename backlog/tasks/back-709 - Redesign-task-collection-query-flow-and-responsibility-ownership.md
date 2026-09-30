---
id: BACK-709
title: Redesign task collection query flow and responsibility ownership
status: To Do
assignee: []
created_date: '2026-09-30 07:11'
labels: []
dependencies: []
references:
  - src/server/task-collection.ts
  - src/server/resources/tasks.ts
  - src/core/task-query-workflow.ts
  - src/core/backlog.ts
type: chore
ordinal: 343000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user inspected resolveTaskCollectionQuery after BACK-708 and rejected the quality of the surrounding flow, not merely its complexity score. The current GET /api/tasks path combines URL decoding, configuration reads, filter canonicalization, parent identity lookup, HTTP response construction, and cross-branch refresh coordination. Parent resolution performs fallback lookups with a hard-coded task- prefix, while readiness and refresh decisions are passed between the server and Core task-read workflow. Review the complete request-to-query path, including src/core/task-query-workflow.ts, rather than extracting more helpers from one function. BACK-708 accepted this finding with an explanation; that disposition does not satisfy this newly explicit request. The objective is a simpler, understandable design with clear ownership and consistent task-query semantics. This task is handed off to another agent; implementation has not started. Preserve the existing uncommitted refactoring baseline. Repository-wide HTTP validation changes and real-provider Workspace acceptance are separate work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The task collection request-to-result flow has clear ownership for transport decoding/error mapping, filter and identity semantics, and task-read lifecycle; a reviewer can follow it without tracing scattered refresh flags or mixed Response/query return values through domain resolution.
- [ ] #2 Parent filtering uses canonical task identity semantics, including configured prefixes, missing parents and ambiguous IDs; no independent hard-coded prefix fallback policy remains in the HTTP adapter.
- [ ] #3 Priority, status exclusions, assignee, labels and crossBranch query behavior is covered through the HTTP route, including repeated/comma-delimited inputs and malformed values; any intentional change from existing behavior is explicitly documented and agreed before implementation.
- [ ] #4 Parent resolution and collection reads coordinate refresh through a coherent owner, with regressions covering cold/warm reads, local-only versus cross-branch scope, and stale results during project/session replacement.
- [ ] #5 The resulting simplification addresses the end-to-end design rather than only lowering analyzer metrics; focused HTTP and Core regression tests, TypeScript and applicable lint checks pass, and any remaining complexity finding is assessed against the resulting source.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
