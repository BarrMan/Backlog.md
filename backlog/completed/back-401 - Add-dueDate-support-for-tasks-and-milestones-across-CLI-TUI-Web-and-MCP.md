---
task_schema_version: 2
id: BACK-401
title: 'Add dueDate support for tasks and milestones across CLI, TUI, Web, and MCP'
status: Done
assignee:
  - '@codex'
created_date: '2026-03-01 20:56'
updated_date: '2026-08-10 06:07'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/551'
modified_files:
  - CLI-INSTRUCTIONS.md
  - src/cli.ts
  - src/commands/task-wizard.ts
  - src/core/backlog.ts
  - src/file-system/operations.ts
  - src/formatters/json-output.ts
  - src/formatters/task-plain-text.ts
  - src/markdown/parser.ts
  - src/markdown/serializer.ts
  - src/mcp/tools/milestones/handlers.ts
  - src/mcp/tools/milestones/schemas.ts
  - src/mcp/tools/tasks/handlers.ts
  - src/mcp/utils/schema-generators.ts
  - src/mcp/validation/validators.ts
  - src/server/index.ts
  - src/types/index.ts
  - src/types/task-edit-args.ts
  - src/ui/components/task-composer.ts
  - src/ui/task-viewer-with-search.ts
  - src/utils/task-edit-builder.ts
  - src/utils/utc-datetime.ts
  - src/web/components/MilestonesPage.tsx
  - src/web/components/TaskDetailsModal.tsx
  - src/web/components/TaskList.tsx
  - src/web/lib/api.ts
  - src/test/cli-due-date.test.ts
  - src/test/cli-json-output.test.ts
  - src/test/due-date.test.ts
  - src/test/mcp-milestones.test.ts
  - src/test/mcp-tasks.test.ts
  - src/test/server-due-date-endpoint.test.ts
  - src/test/task-wizard.test.ts
  - src/test/tui-task-composer.test.ts
  - src/test/web-milestones-page-search.test.tsx
  - src/test/web-task-list-table-width.test.tsx
  - src/test/web-task-types.test.tsx
priority: medium
description: >-
  Introduce optional dueDate for tasks and milestones and expose it consistently
  across all user surfaces. Keep the field name strictly as dueDate (no deadline
  alias). Date parsing/storage/display semantics should follow the existing
  createdDate behavior already used in the project.
implementation_plan: >-
  1. Add a shared strict UTC datetime normalizer and persist optional dueDate
  for tasks and milestones in Markdown.

  2. Thread dueDate create, edit, clear, and display behavior through CLI and
  TUI surfaces.

  3. Add dueDate to Web API, forms, lists, details, and milestone workflows.

  4. Add dueDate to MCP task and milestone schemas, handlers, and responses.

  5. Add focused parser, serializer, CLI, TUI, Web, server, MCP, and JSON tests;
  then run typecheck, Biome, build, and relevant suites.
implementation_notes: >-
  Product decision: dueDate is a UTC datetime. Store it canonically as
  YYYY-MM-DD HH:mm; accept equivalent ISO datetime input, reject date-only
  values, and use null or the surface-specific clear flag to remove it.


  Implementation uses one shared normalizer for task and milestone persistence
  and server validation. Explicit offsets are converted to UTC at minute
  precision, and normalized values are guaranteed to remain four-digit and
  round-trippable. A malformed milestone file is skipped individually instead of
  hiding the valid collection.


  The public MCP edit schemas declare string-or-null dueDate fields, canonical
  CLI JSON exposes dueDate as RFC 3339 UTC, and CLI-INSTRUCTIONS documents the
  additive stable field and due-date commands. Web and TUI list/detail displays
  retain the time and identify UTC.


  Validation:

  - 126 cross-surface tests passed across UTC normalization and persistence, CLI
  due-date and JSON output, task wizard, MCP tasks and milestones, server
  handlers, and Web task/milestone/list paths.

  - 28 TUI composer model and interaction tests passed; 7 TUI task-detail tests
  passed.

  - bunx tsc --noEmit, bun run check ., bun run build, and git diff --check
  passed.

  - Independent final diff review found no remaining P1/P2 issues.


  Environment note: the unfiltered TUI composer file has one pre-existing
  filesystem-watcher delivery timeout in this sandbox; the same test fails
  unchanged at the base commit, while all feature-owned TUI selections pass.
final_summary: >-
  Added optional UTC dueDate support for tasks and milestones across Markdown
  persistence, types, CLI and interactive TUI, stable JSON, Web/server APIs and
  UI, and MCP schemas/handlers. Create, update, display, ISO-offset
  normalization, date-only rejection, and explicit clear behavior are consistent
  across surfaces, with focused regression coverage and public CLI
  documentation.
acceptance_criteria:
  - index: 1
    text: >-
      Tasks support optional dueDate end-to-end: types, create/edit flows,
      markdown frontmatter persistence, and load/save parsing.
    checked: true
  - index: 2
    text: >-
      Milestones support optional dueDate end-to-end: types, milestone file
      persistence/parsing, and list/create/update flows where applicable.
    checked: true
  - index: 3
    text: >-
      CLI plain and interactive task surfaces include dueDate where task
      details/listing are shown, and task create/edit accepts dueDate input.
    checked: true
  - index: 4
    text: >-
      Web UI and server API support dueDate for tasks and milestones in
      create/edit/list/view paths.
    checked: true
  - index: 5
    text: >-
      MCP task and milestone schemas/handlers support dueDate only (no deadline
      alias) and return it in task/milestone outputs.
    checked: true
  - index: 6
    text: >-
      Automated tests cover dueDate parsing/serialization and at least one path
      each for CLI, web/server, and MCP.
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
