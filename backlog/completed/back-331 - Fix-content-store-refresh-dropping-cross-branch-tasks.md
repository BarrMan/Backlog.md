---
task_schema_version: 2
id: BACK-331
title: Fix content store refresh dropping cross-branch tasks
status: Done
assignee:
  - '@codex'
created_date: '2025-12-03 18:10'
updated_date: '2025-12-03 18:17'
labels:
  - bug
  - content-store
dependencies: []
priority: high
description: >-
  Refreshing tasks from the filesystem currently reloads only the local branch
  tasks and drops cross-branch read-only entries after any watcher event. Update
  refresh logic to load tasks the same way as initial load (including
  cross-branch) so watcher updates do not remove remote tasks. Add coverage to
  prevent regressions.
implementation_notes: >-
  Updated content store task refresh to reuse the taskLoader so cross-branch
  tasks persist after watcher-triggered reloads; added regression test covering
  loader-based refresh; reran bun test src/test/content-store.test.ts.
acceptance_criteria:
  - index: 1
    text: >-
      Refreshing tasks via watcher/refresh preserves cross-branch (read-only)
      tasks; they remain visible alongside local tasks after filesystem updates.
    checked: true
  - index: 2
    text: >-
      Task refresh path uses the same loader as initial load or merges results
      to include cross-branch tasks.
    checked: true
  - index: 3
    text: Automated tests cover the refresh behavior to prevent regression.
    checked: true
definition_of_done: []
comments: []
---
