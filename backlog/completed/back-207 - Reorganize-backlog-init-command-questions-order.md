---
task_schema_version: 2
id: BACK-207
title: Reorganize backlog init command questions order
status: Done
assignee:
  - '@claude'
created_date: '2025-07-26'
updated_date: '2025-07-26'
labels:
  - cli
  - ux
  - enhancement
dependencies: []
description: >-
  Reorder the prompts in the backlog init command to improve logical flow and
  user experience. Remove the automatic git commits question and keep it only in
  advanced settings.
implementation_notes: >-
  - Reorganized src/cli.ts init command to follow the specified order

  - Each main prompt is numbered (1-7) with nested prompts as sub-items (e.g.,
  1.1, 1.2)

  - Cross-branch checking prompts only show remote operations and active days
  when enabled

  - Zero-padding prompts only show digit count when enabled

  - Web UI prompts only show port and browser settings when override is selected

  - Changed "Configure web UI" to "Override default web UI settings" as
  requested

  - Added "(space to select)" directly in the agent instructions prompt message

  - Kept autoCommit as a hidden/advanced setting with default false

  - All prompts use consistent error handling with onCancel callbacks

  - Tested prompt flow to ensure conditional nesting works correctly
acceptance_criteria:
  - index: 1
    text: 'Init command prompts appear in this order:'
    checked: true
  - index: 2
    text: >-
      Cross-branch checking prompts are nested properly (remote operations and
      active days only show if cross-branch is enabled)
    checked: true
  - index: 3
    text: >-
      Zero-padding prompts are nested properly (digit count only shows if
      zero-padding is enabled)
    checked: true
  - index: 4
    text: Web UI prompt uses 'override' instead of 'configure'
    checked: true
  - index: 5
    text: Agent selection prompt includes hint about space to select
    checked: true
  - index: 6
    text: Automatic git commits question is removed from init flow
    checked: true
definition_of_done: []
comments: []
---
## Acceptance Criteria
<!-- AC:BEGIN -->
  1. Cross-branch checking configuration
  2. Git hooks bypass
  3. Zero-padding configuration
  4. Default editor
  5. Override web UI settings
  6. Agent instructions selection
  7. Claude agent installation
<!-- AC:END -->