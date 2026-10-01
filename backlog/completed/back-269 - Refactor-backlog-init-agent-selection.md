---
task_schema_version: 2
id: BACK-269
title: Refactor backlog init agent selection
status: Done
assignee:
  - '@codex'
created_date: '2025-09-17 21:19'
updated_date: '2025-09-18 18:10'
labels: []
dependencies: []
description: >-
  Users often skip reading the prompts in backlog init and simply press enter
  through the agent selection step. Update the interactive flow so pressing
  enter while focused on an agent selects the currently highlighted agent
  (mirroring a single-select action), while space retains multi-select behavior.
  Ensure the command validates that at least one agent is chosen before
  continuing and that enter does not fall back to auto-selecting the first agent
  when nothing is highlighted.
implementation_notes: >-
  Enter now auto-selects the highlighted agent during interactive init, with
  space still toggling multi-select.

  Selection processing requires at least one agent file, rejecting only-"none"
  submissions.

  Added utility + tests for the selection normalization logic and updated CLI
  tests pass.


  Highlight fallback only triggers after actual cursor movement, so pressing
  Enter immediately no longer selects CLAUDE.md by default.
acceptance_criteria:
  - index: 1
    text: >-
      Enter selects the currently highlighted agent file in the backlog init
      agent picker.
    checked: true
  - index: 2
    text: Space continues to support multi-select for choosing multiple agents.
    checked: true
  - index: 3
    text: >-
      Backlog init blocks progress until at least one agent file is explicitly
      selected.
    checked: true
  - index: 4
    text: >-
      Pressing enter without a selection does not default to the first agent;
      the user must select manually.
    checked: true
definition_of_done: []
comments: []
---
