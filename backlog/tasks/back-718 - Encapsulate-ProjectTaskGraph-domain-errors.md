---
task_schema_version: 2
id: BACK-718
title: Encapsulate ProjectTaskGraph domain errors
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-09-30 14:52'
updated_date: '2026-09-30 15:14'
labels: []
dependencies: []
modified_files:
  - src/core/domain-errors.ts
  - src/core/project-task-graph.ts
  - src/core/backlog.ts
  - src/test/project-task-graph.test.ts
type: chore
ordinal: 352000
description: >-
  ProjectTaskGraph callers must handle graph-specific domain failures through a
  small owned error contract rather than coupling to leaked implementation
  exceptions. BACK-709 remains completed and is not reopened.
implementation_plan: >-
  1. Remove graph-specific duplicate parent errors. 2. Centralize
  task-collection errors in core domain-errors and make ProjectTaskGraph use the
  established task-identity errors. 3. Update focused graph assertions and
  verify within the 30-second budget.
implementation_notes: >-
  Implemented graph-owned parent-resolution errors and released the full corpus
  snapshot after initialization. Server follow-up: src/server/errors.ts must
  import TaskCollectionFilterError, ProjectTaskGraphParentNotFoundError, and
  ProjectTaskGraphAmbiguousParentError from ../core/domain-errors.ts; map the
  graph errors to 404 and 409 respectively. Focused graph test and owned-file
  Biome check pass; full tsc remains blocked by concurrent server-resource
  errors.


  Corrected the graph error boundary: resolveParentTask now throws
  AmbiguousTaskIdError and TaskCollectionParentNotFoundError. Moved the
  parent-not-found collection error to domain-errors, removed graph-specific
  duplicates, and added candidate/message contract assertions. Focused graph
  test and owned-file Biome check pass.
acceptance_criteria:
  - index: 1
    text: >-
      Graph validation and lookup failures are represented by graph-owned domain
      errors with actionable messages
    checked: false
  - index: 2
    text: >-
      Graph consumers handle the owned error contract without importing or
      depending on internal error shapes
    checked: false
  - index: 3
    text: >-
      Focused graph and affected caller tests cover invalid and ambiguous graph
      failure paths
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
