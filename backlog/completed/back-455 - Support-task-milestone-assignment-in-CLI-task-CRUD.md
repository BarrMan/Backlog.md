---
task_schema_version: 2
id: BACK-455
title: Support task milestone assignment in CLI task CRUD
status: Done
assignee:
  - '@codex'
created_date: '2026-05-01 13:28'
updated_date: '2026-05-02 01:01'
labels:
  - cli
  - milestones
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/618'
modified_files:
  - src/cli.ts
  - src/mcp/tools/tasks/handlers.ts
  - src/server/index.ts
  - src/test/cli-task-milestone.test.ts
  - src/utils/milestone-storage.ts
priority: medium
description: >-
  GitHub issue #618 requests milestone support on CLI task create/edit so users
  do not need to edit task files directly or use the HTTP API to assign tasks to
  milestones. Implement a public CLI path that follows existing task milestone
  storage semantics and works with current milestone-aware Web/MCP behavior.
  Context: https://github.com/MrLesk/Backlog.md/issues/618
implementation_plan: >-
  1. Add shared milestone storage-input resolver used by CLI plus existing
  API/MCP paths.

  2. Add CLI task create/edit milestone flags, including explicit clearing on
  edit.

  3. Add focused CLI tests for create, edit, title/ID normalization, and clear.

  4. Validate with scoped tests, typecheck, and Biome.
final_summary: >-
  Added CLI task milestone assignment for `task create` and `task edit`,
  including title/ID alias normalization shared with API/MCP and explicit
  clearing through `task edit --clear-milestone`. Added focused CLI coverage for
  create, edit, clear, conflicting flags, and help output, then validated with
  scoped tests, full test suite, typecheck, and Biome.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog task create` supports setting a task milestone using the existing
      task milestone field
    checked: true
  - index: 2
    text: >-
      `backlog task edit` supports setting and clearing a task milestone without
      direct file edits
    checked: true
  - index: 3
    text: CLI help and validation make the milestone behavior discoverable and safe
    checked: true
  - index: 4
    text: 'Focused tests cover create, update, and clear milestone flows'
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
