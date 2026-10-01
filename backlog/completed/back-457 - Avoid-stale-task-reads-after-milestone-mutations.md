---
task_schema_version: 2
id: BACK-457
title: Avoid stale task reads after milestone mutations
status: Done
assignee:
  - '@codex'
created_date: '2026-05-01 21:49'
updated_date: '2026-05-01 21:55'
labels:
  - bug
  - web
  - ci
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/actions/runs/25233629990'
  - 'https://github.com/MrLesk/Backlog.md/pull/620'
modified_files:
  - src/mcp/tools/milestones/handlers.ts
  - src/server/index.ts
priority: high
description: >-
  The post-merge CI run for BACK-456 failed because Web API milestone removal
  could read or return stale milestone data from the server ContentStore
  immediately after task writes. Milestone mutations should load editable local
  tasks directly from disk, and direct task reads should prefer the local task
  file while still falling back to the store for non-local/cross-branch tasks.
final_summary: >-
  Fixed the stale milestone mutation CI failure by loading editable local tasks
  directly from disk during milestone rename/remove operations and by making
  direct task GETs prefer a fresh local file before falling back to the
  ContentStore. Verified with the failing two-file test combination, full bun
  test with CI concurrency, typecheck, and Biome check.
acceptance_criteria:
  - index: 1
    text: >-
      `GET /api/task/:id` returns the freshly persisted local task when the file
      exists, even if ContentStore has stale data.
    checked: true
  - index: 2
    text: >-
      Cross-branch/store-backed task lookup still works when no local task file
      exists.
    checked: true
  - index: 3
    text: >-
      Milestone removal uses fresh local task files when clearing or reassigning
      tasks.
    checked: true
  - index: 4
    text: The failing milestone removal Web API test passes reliably.
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
