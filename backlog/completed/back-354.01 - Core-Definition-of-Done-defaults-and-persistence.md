---
task_schema_version: 2
id: BACK-354.01
title: 'Core: Definition of Done defaults and persistence'
status: Done
assignee:
  - '@codex'
created_date: '2025-12-28 20:34'
updated_date: '2026-01-17 21:58'
labels: []
dependencies: []
parent_task_id: BACK-354
description: >-
  Add core support for a per-project Definition of Done checklist that is
  inherited by new tasks and stored as a distinct, checkable section.
implementation_plan: >-
  Plan:

  1) Add `definition_of_done` to config parse/serialize and `BacklogConfig`
  type.

  2) Implement DoD markdown persistence using AC-style markers (`<!--
  DOD:BEGIN/END -->`) and parser/serializer hooks; ensure tasks without DoD
  unchanged.

  3) Add DoD fields to task domain + inputs, apply defaults on create, and
  support add/remove/check/uncheck in `updateTaskFromInput` (no replace).

  4) Add core tests for config + create defaults + update operations.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog/config.yml` supports a `definition_of_done` array (like
      `statuses`) and config load/save preserves it.
    checked: true
  - index: 2
    text: >-
      Core applies DoD defaults to new tasks as a distinct `Definition of Done`
      checklist section with unchecked items by default.
    checked: true
  - index: 3
    text: >-
      Task creation supports defaults/replace/append/disable behavior for DoD
      items.
    checked: true
  - index: 4
    text: >-
      DoD checklist items persist with checked state separate from acceptance
      criteria; tasks without DoD remain unchanged on load/save.
    checked: true
  - index: 5
    text: >-
      Core update operations support setting/adding/removing/checking/unchecking
      DoD items, mirroring acceptance criteria semantics.
    checked: true
  - index: 6
    text: >-
      Automated tests cover config parsing/serialization plus default/override
      persistence and update behavior.
    checked: true
definition_of_done: []
comments: []
---
