---
task_schema_version: 2
id: BACK-69
title: 'CLI: start tasks IDs at 1'
status: Done
assignee:
  - '@codex'
created_date: '2025-06-15'
updated_date: '2025-06-15'
labels: []
dependencies: []
description: |-
  Ensure the CLI starts numbering tasks from **1** rather than **0** when a new
  project is initialized. Currently, the ID generator returns `task-0` for the
  first task which can be confusing.
implementation_notes: >-
  The task ID generation was already correctly implemented to start at 1. The
  `generateNextId()` function in `src/cli.ts` initializes the maximum ID to 0
  and returns `task-${max + 1}`, ensuring the first task gets ID `task-1`.
acceptance_criteria:
  - index: 1
    text: '`generateNextId()` returns `task-1` when no tasks exist'
    checked: true
  - index: 2
    text: '`backlog init` followed by `backlog task create` produces a file named'
    checked: true
  - index: 3
    text: Unit test verifies ID generation starts at 1
    checked: true
definition_of_done: []
comments: []
---
## Acceptance Criteria
<!-- AC:BEGIN -->
  `task-1 - <title>.md`
<!-- AC:END -->