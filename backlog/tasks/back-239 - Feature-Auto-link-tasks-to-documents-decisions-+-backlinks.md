---
task_schema_version: 2
id: BACK-239
title: 'Feature: Auto-link tasks to documents/decisions + backlinks'
status: To Do
assignee:
  - '@codex'
created_date: '2025-08-17 16:54'
labels:
  - web
  - enhancement
  - docs
dependencies: []
priority: medium
ordinal: 6000
description: >-
  Add first-class linking between tasks and documents/decisions (from issue
  #271).


  Goal:

  - Let users reference documents/decisions directly in task content (e.g.,
  "Documented in doc-12" or "See decision-3").

  - In the web UI, references render as clickable links to the target
  doc/decision.

  - On a document/decision page, show a "Referenced by" list of tasks that
  mention it (computed dynamically; no file mutation).


  Scope (MVP):

  - Recognize references in task body using simple, unambiguous patterns:
  `doc-<id>` and `decision-<id>` (optionally prefixed with `#`).

  - Don't render links inside code blocks.

  - No rich previews; plain links with title when available.

  - Backlinks computed client-side (or server-side) by scanning tasks for
  references; do not write backlinks into files.


  Notes:

  - Extend later to support linking from docs -> tasks, and to other entities if
  needed.
acceptance_criteria:
  - index: 1
    text: >-
      Web: task detail/body renders doc-<id> and decision-<id> as links to their
      pages; not inside code blocks
    checked: false
  - index: 2
    text: >-
      Web: document/decision pages show a Referenced by list of tasks that
      mention the ID
    checked: false
  - index: 3
    text: >-
      Support patterns: `doc-<n>`, `decision-<n>`, with or without a leading `#`
      (e.g., #doc-1)
    checked: false
  - index: 4
    text: Links include the target title when available; otherwise show the ID
    checked: false
  - index: 5
    text: No file mutation for backlinks; computed at render time
    checked: false
  - index: 6
    text: 'Add short docs: how to reference docs/decisions from tasks (examples)'
    checked: false
definition_of_done: []
comments: []
---
