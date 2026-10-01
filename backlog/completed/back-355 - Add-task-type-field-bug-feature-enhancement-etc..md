---
task_schema_version: 2
id: BACK-355
title: 'Add task type field (bug, feature, enhancement, etc.)'
status: Done
assignee:
  - '@codex'
created_date: '2026-01-01 23:37'
updated_date: '2026-07-17 06:33'
labels:
  - enhancement
  - core
  - cli
  - mcp
  - web
dependencies: []
priority: medium
description: >-
  Add a mutually exclusive 'type' field to tasks that categorizes them
  semantically. Unlike labels (which are additive tags), type is exclusive -
  each task has exactly one type. This enables clearer task categorization,
  better reporting and metrics (e.g., bug count vs feature count), and supports
  type-specific workflows. Aligns with industry-standard issue trackers (GitHub,
  Jira, Linear).
implementation_plan: >-
  1. Verify the six completed child records and merged behavior cover every
  parent acceptance criterion.

  2. Run focused current tests for core/config persistence, CLI, MCP, filtering,
  TUI, and Web behavior.

  3. Reconcile only the parent task with checked evidence, validation notes,
  final summary, and terminal status.
implementation_notes: >-
  Final reconciliation on origin/main 22a091b5. Focused verification passed
  103/103 tests with 691 assertions across 10 files. Evidence mapping: AC #1,
  #7, #9: task-type config, core, CLI, MCP, and server validation tests; AC #2:
  CLI create/edit/help/completion tests; AC #3: MCP create/edit/schema/output
  tests; AC #4: TUI board badge and detail tests; AC #5: Web badge,
  create/edit/clear, and error-recovery tests; AC #6: Core/store/CLI/MCP OR
  filtering plus Web board URL filtering tests; AC #8: YAML frontmatter CRUD
  round-trip tests; AC #10: parser, CLI, TUI, and Web untyped behavior tests.
  bunx tsc --noEmit, bun run check . (336 files), and bun run build passed. All
  six child records remain Done; no product code changed. The parent defines no
  Definition of Done items.
final_summary: >-
  Completed the parent task after all six task-type children landed. Backlog.md
  now supports project-configured optional task types with validated YAML
  persistence, CLI and MCP create/edit/output, list and search filtering, and
  distinct TUI and Web display/edit flows while existing tasks remain untyped.
  Verified on origin/main 22a091b5 with 103 focused tests, 0 failures,
  typecheck, Biome, and build.
acceptance_criteria:
  - index: 1
    text: >-
      Task types are configurable per-project in config.yml with sensible
      defaults
    checked: true
  - index: 2
    text: CLI task create and task edit commands support --type flag
    checked: true
  - index: 3
    text: MCP task_create and task_edit tools include type parameter
    checked: true
  - index: 4
    text: TUI board displays task type with visual distinction (icon or badge)
    checked: true
  - index: 5
    text: Web UI displays task type in task cards and detail view
    checked: true
  - index: 6
    text: >-
      task list --type and search --task-type support the same validated OR
      type-filter semantics
    checked: true
  - index: 7
    text: Type validation ensures value is one of the configured types
    checked: true
  - index: 8
    text: Type field persists in task markdown YAML frontmatter
    checked: true
  - index: 9
    text: >-
      Task domain model includes an optional 'type' field; default allowed set:
      bug, feature, enhancement, task, chore, docs, spike (project-overridable
      via the 'types' config key)
    checked: true
  - index: 10
    text: >-
      Existing tasks without a 'type' field stay untyped: the parser leaves type
      undefined, display surfaces show no type badge/value for them, and there
      is no retroactive defaulting or migration
    checked: true
definition_of_done: []
comments: []
---
