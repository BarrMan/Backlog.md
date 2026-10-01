---
task_schema_version: 2
id: BACK-39
title: 'CLI: fix empty agent instruction files on init'
status: Done
assignee:
  - '@codex'
reporter: '@MrLesk'
created_date: '2025-06-10'
updated_date: '2025-06-10'
labels:
  - cli
  - bug
dependencies: []
description: >-
  Backlog init should populate selected agent instruction files with default
  content instead of creating empty files.
implementation_notes: >-
  - Imported guideline constants may resolve to file paths when bundled. Added
    `_loadAgentGuideline` helper to read file contents when needed.
  - `addAgentInstructions` now loads guideline text before writing files,
  ensuring
    non-empty content in `AGENTS.md`, `CLAUDE.md`, and `.cursorrules`.
  - Updated CLI and tests to verify content length instead of specific words.
acceptance_criteria:
  - index: 1
    text: >-
      Selected agent instruction files contain default guideline text after
      running `backlog init`
    checked: true
  - index: 2
    text: Automated test verifies non-empty content is written to each created file
    checked: true
definition_of_done: []
comments: []
---
