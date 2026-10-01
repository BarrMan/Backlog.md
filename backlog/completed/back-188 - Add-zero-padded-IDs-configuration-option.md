---
task_schema_version: 2
id: BACK-188
title: Add zero-padded IDs configuration option
status: Done
assignee:
  - '@mjgs'
created_date: '2025-07-12'
updated_date: '2025-07-13'
labels:
  - feature
  - config
  - ids
  - formatting
dependencies: []
priority: medium
description: >-
  Add support for zero-padded IDs for tasks, documents, and decisions to enable
  consistent formatting and better lexicographical sorting. When enabled through
  the `zeroPaddedIds` configuration option, newly generated IDs will be
  left-padded with zeros to the specified length (e.g., `task-001`, `doc-001`
  instead of `task-1`, `doc-1`).
implementation_plan: >-
  1. Add `zeroPaddedIds` field to BacklogConfig type

  2. Update `generateNextId`, `generateNextDocId`, and `generateNextDecisionId`
  functions

  3. Implement conditional padding logic using `String.padStart()`

  4. Add configuration get/set support for zeroPaddedIds

  5. Create comprehensive test suite covering all scenarios

  6. Update README with configuration documentation


  ## Technical Details


  The implementation uses `String.padStart()` to apply zero-padding when
  `config.zeroPaddedIds` is greater than 0. Sub-task IDs automatically use
  2-digit padding for the decimal portion regardless of the main padding setting
  to ensure consistent formatting of hierarchical IDs.
implementation_notes: >-
  Added support for zero-padded IDs across all item types through a new
  `zeroPaddedIds` configuration option. The implementation includes:


  - **ID Generation**: Modified CLI functions to check config and apply padding
  using `String.padStart()`

  - **Sub-task Support**: Fixed 2-digit padding for sub-task portions (e.g.,
  `task-001.01`)

  - **Configuration**: Full integration with config system including get/set
  commands

  - **Configuration management through `backlog config set zeroPaddedIds
  <number>`

  - Setting to 0 or using `backlog config set zeroPaddedIds 0` disables padding

  - **Validation**: Padding limited to 1-10 digits for practical use

  - **Testing**: Comprehensive E2E tests covering enabled/disabled scenarios and
  all item types


  This feature improves file organization and provides consistent formatting
  that aligns with common issue tracking conventions.
acceptance_criteria:
  - index: 1
    text: Add `zeroPaddedIds` configuration option to specify padding width
    checked: true
  - index: 2
    text: >-
      Update ID generation for tasks, documents, and decisions to support
      padding
    checked: true
  - index: 3
    text: 'Add sub-task ID padding with fixed 2-digit format (e.g., `task-001.01`)'
    checked: true
  - index: 4
    text: Maintain backward compatibility - padding disabled by default (value 0)
    checked: true
  - index: 5
    text: >-
      Add configuration validation to ensure reasonable padding limits (1-10
      digits)
    checked: true
  - index: 6
    text: Make padding configurable via `backlog config set zeroPaddedIds <number>`
    checked: true
  - index: 7
    text: Add comprehensive E2E tests for padded and non-padded ID generation
    checked: true
  - index: 8
    text: Update documentation explaining the new configuration option
    checked: true
definition_of_done: []
comments: []
---
