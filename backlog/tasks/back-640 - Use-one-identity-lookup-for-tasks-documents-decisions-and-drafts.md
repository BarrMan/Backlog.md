---
task_schema_version: 2
id: BACK-640
title: 'Use one identity lookup for tasks, documents, decisions, and drafts'
status: To Do
assignee: []
created_date: '2026-08-26 18:40'
labels: []
dependencies:
  - BACK-636
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/940'
  - BACK-580
type: enhancement
ordinal: 275000
description: >-
  After drafts have a single finder, every surface should look up a task,
  document, decision, or draft the same way: one fail-closed resolver per type,
  never a second first-match path.


  CLI, TUI, web, and MCP must all go through that path. Reuse the existing
  unique-or-stop helpers (entity-id.ts and the per-type wrappers). Do not add a
  new service or layer.


  Identity source stays as already agreed unless a later product decision
  changes it: tasks and drafts are filename-derived; documents and decisions are
  frontmatter-derived (BACK-580 / BACK-600). This task unifies the lookup door,
  not the meaning of an id.


  Prefixing tasks with draft, doc, or decision is unsupported and is not a
  scenario to design for (see also BACK-635).
acceptance_criteria:
  - index: 1
    text: >-
      Looking up a task, document, decision, or draft by id never silently picks
      the first matching file
    checked: false
  - index: 2
    text: >-
      CLI and web/MCP fail closed the same way on an ambiguous id for each of
      those four types
    checked: false
  - index: 3
    text: >-
      No new service or identity layer is introduced; existing unique-or-stop
      helpers are reused or collapsed
    checked: false
  - index: 4
    text: Tests cover ambiguous lookup for each entity type on more than one surface
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
