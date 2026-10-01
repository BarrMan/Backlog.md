---
task_schema_version: 2
id: BACK-356
title: Add references field to task domain object
status: Done
assignee:
  - '@codex'
created_date: '2026-01-01 23:39'
updated_date: '2026-01-16 19:08'
labels: []
dependencies: []
references:
  - 'https://github.com/example/docs/task-fields'
  - src/types/index.ts
  - src/web/components/TaskDetailsModal.tsx
priority: medium
description: >-
  Add a new `references` field to the task domain object that stores an array of
  strings. Each entry can be:

  - External URLs (e.g., related GitHub issues, Stack Overflow answers, blog
  posts)

  - Local file paths relative to the repo root (e.g.,
  `src/components/Button.tsx`, `tests/auth.test.ts`)


  This field allows tasks to link to relevant code files, external resources, or
  related issues. Unlike the `documentation` field (which points to reference
  materials for understanding), `references` tracks files and URLs that are
  directly relevant to the task's implementation or context.
implementation_plan: >-
  ## Implementation Plan


  ### Files to Modify

  1. `src/types/index.ts` - Add `references?: string[]` to Task,
  TaskCreateInput, TaskUpdateInput

  2. `src/markdown/parser.ts` - Parse `references` from frontmatter

  3. `src/markdown/serializer.ts` - Include `references` in frontmatter output

  4. `src/core/backlog.ts` - Handle references in create/update operations

  5. `src/cli.ts` - Add `--ref` flag to task create/edit commands

  6. `src/mcp/utils/schema-generators.ts` - Add references to task_create and
  task_edit schemas

  7. `src/formatters/task-plain-text.ts` - Display references in CLI output

  8. `src/ui/task-viewer-with-search.ts` - Display in TUI detail pane and kanban
  popup

  9. `src/web/components/TaskDetailsModal.tsx` - Add references section with
  appropriate design for longer content (URLs, file paths)

  10. `src/test/` - Add unit tests for references CRUD


  ### Design Decisions

  - `--ref` flag (repeatable, comma-separated)

  - No validation of references (can be URLs or file paths)

  - Web UI: Design for longer content - use Chrome DevTools MCP to iterate on
  design

  - Display pattern follows dependencies/labels conventions
acceptance_criteria:
  - index: 1
    text: 'Task type includes optional `references: string[]` field'
    checked: true
  - index: 2
    text: CLI supports --ref flag for task create/edit (can be used multiple times)
    checked: true
  - index: 3
    text: MCP task_create and task_edit schemas include references field
    checked: true
  - index: 4
    text: task_view output displays reference links
    checked: true
  - index: 5
    text: References persist in task markdown files
    checked: true
  - index: 6
    text: Unit tests cover CRUD operations for references field
    checked: true
  - index: 7
    text: TUI task detail pane displays references
    checked: true
  - index: 8
    text: TUI kanban board task popup displays references
    checked: true
  - index: 9
    text: Web UI task detail modal displays references
    checked: true
definition_of_done: []
comments: []
---
