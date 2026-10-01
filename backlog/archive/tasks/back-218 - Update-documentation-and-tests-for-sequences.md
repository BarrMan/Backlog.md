---
task_schema_version: 2
id: BACK-218
title: Update documentation and tests for sequences
status: To Do
assignee: []
created_date: '2025-07-27'
updated_date: '2026-07-04 17:40'
labels:
  - sequences
  - documentation
  - testing
dependencies:
  - task-213
  - task-214
  - task-215
  - task-217
description: >-
  Ensure users and developers understand how sequences work across all
  interfaces and that the new feature is covered by tests and documentation.
implementation_notes: sequences feature removed by owner decision
acceptance_criteria:
  - index: 1
    text: >-
      Update Backlog.md documentation (e.g., in backlog/docs/) to explain the
      concept of sequences, how they are automatically computed from
      dependencies, and how to view/manipulate them via CLI, TUI and the web UI.
    checked: false
  - index: 2
    text: >-
      Update main README.md to document sequences feature and how it enables
      parallel task execution within each sequence.
    checked: false
  - index: 3
    text: >-
      Update agent instructions (src/guidelines/agent-guidelines.md) to explain
      that agents can work on all tasks within a sequence in parallel, as they
      have no dependencies on each other.
    checked: false
  - index: 4
    text: >-
      Update CLI help text to include the new sequence command and its options
      (including --plain).
    checked: false
  - index: 5
    text: >-
      Ensure that acceptance criteria across all tasks have corresponding tests
      and that all docs reflect the current behaviour.
    checked: false
  - index: 6
    text: >-
      Docs explain Unsequenced bucket (no deps/dependees/ordinal), join
      semantics for moves, and insert-between via drop zones (later task)
    checked: false
  - index: 7
    text: >-
      CLI/TUI docs: --plain prints Unsequenced first; TUI move mode uses join
      semantics; blocked moves to Unsequenced unless isolated
    checked: false
  - index: 8
    text: >-
      Web UI docs: endpoints shape ({ unsequenced, sequences }), join semantics,
      error handling; update examples/screenshots
    checked: false
definition_of_done: []
comments: []
---
