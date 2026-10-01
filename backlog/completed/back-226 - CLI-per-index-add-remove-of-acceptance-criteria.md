---
task_schema_version: 2
id: BACK-226
title: 'CLI: per-index add/remove of acceptance criteria'
status: Done
assignee: []
created_date: '2025-08-08 22:30'
updated_date: '2025-08-09 19:28'
labels:
  - cli
  - enhancement
dependencies: []
priority: medium
description: >-
  Extend the CLI to support adding, removing, checking, and unchecking
  individual acceptance criteria. This enables granular automation (e.g., CI
  pipelines) with precise control over acceptance criteria management from
  command line tools and scripts.


  The implementation uses stable markers (`<!-- AC:BEGIN -->` and `<!-- AC:END
  -->`) to clearly delineate the acceptance criteria section, with each
  criterion numbered for easy reference (1-based indexing).


  ## Usage Examples


  ```bash

  # Add new acceptance criteria

  backlog task edit 226 --ac "User sees 'Saved' toast within 1s" --ac "Form
  validates email"


  # Remove acceptance criterion by index (1-based)

  backlog task edit 226 --remove-ac 2


  # Check/uncheck acceptance criteria by index

  backlog task edit 226 --check-ac 1

  backlog task edit 226 --uncheck-ac 3

  ```
implementation_notes: >-
  Implemented CLI acceptance criteria management with stable markers and
  numbered format. Features include:

  - Add new acceptance criteria with --ac flag (can be used multiple times)

  - Remove acceptance criterion by index with --remove-ac

  - Check/uncheck acceptance criterion by index with --check-ac/--uncheck-ac  

  - Automatic migration from old format to stable format

  - Full test coverage and documentation updates


  Key implementation details:

  - Created AcceptanceCriteriaManager class in /src/core/acceptance-criteria.ts

  - Updated CLI command parser to handle new flags

  - Maintains backward compatibility with old format (auto-migrates when edited)

  - 22 passing tests covering all functionality

  - TypeScript fully typed and compiled
acceptance_criteria:
  - index: 1
    text: CLI supports adding acceptance criteria with --ac flag (multiple allowed)
    checked: true
  - index: 2
    text: CLI supports removing acceptance criterion by index with --remove-ac
    checked: true
  - index: 3
    text: CLI supports checking acceptance criterion by index with --check-ac
    checked: true
  - index: 4
    text: CLI supports unchecking acceptance criterion by index with --uncheck-ac
    checked: true
  - index: 5
    text: >-
      Acceptance criteria use stable markers (AC:BEGIN/AC:END) for reliable
      parsing
    checked: true
  - index: 6
    text: 'Each criterion is numbered with #N format for clear indexing (1-based)'
    checked: true
  - index: 7
    text: Invalid indexes return clear errors and non-zero exit code
    checked: true
  - index: 8
    text: Multiple operations can be combined in a single command
    checked: true
  - index: 9
    text: Docs and tests updated for all CLI behaviors
    checked: true
definition_of_done: []
comments: []
---
