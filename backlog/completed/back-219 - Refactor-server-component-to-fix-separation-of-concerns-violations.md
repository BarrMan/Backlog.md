---
task_schema_version: 2
id: BACK-219
title: Refactor server component to fix separation of concerns violations
status: Done
assignee: []
created_date: '2025-07-31'
labels:
  - refactoring
  - architecture
  - server
dependencies: []
priority: high
description: >-
  Refactor the server layer to eliminate business logic violations and become a
  proper thin API layer. The server currently duplicates core functionality and
  contains business logic that belongs in the Core class.
implementation_notes: >-
  Refactored server component to eliminate separation of concerns violations by
  moving all business logic to Core class. The server previously duplicated ID
  generation, auto-commit logic, markdown parsing, and direct git operations.


  Key changes:

  - Moved sophisticated `generateNextId` from CLI to Core, removing server's
  simplified duplicate version

  - Created `core.createTaskFromData()` to handle task construction instead of
  manual object building in server

  - Added `core.updateDecisionFromContent()` and `core.updateDocument()` for
  proper business logic encapsulation

  - Replaced direct git operations with `core.updateTasksBulk()` for consistent
  transactional handling

  - Made Core's `shouldAutoCommit` public to eliminate server duplicate


  Server handlers are now significantly simplified (e.g., `handleCreateTask`
  reduced from 25 lines to 3) and focus purely on HTTP concerns. All 448 tests
  pass with zero breaking changes to existing API endpoints.
acceptance_criteria:
  - index: 1
    text: >-
      Server delegates all ID generation to Core class generateNextId method
      instead of using duplicate logic
    checked: true
  - index: 2
    text: >-
      Server removes duplicate shouldAutoCommit method and uses
      Core.shouldAutoCommit method
    checked: true
  - index: 3
    text: >-
      Server removes duplicate extractSection method and uses appropriate Core
      methods where available
    checked: true
  - index: 4
    text: Server removes direct git operations and delegates to Core git methods
    checked: true
  - index: 5
    text: >-
      Server removes manual task creation logic and uses Core.createTask
      exclusively
    checked: true
  - index: 6
    text: >-
      Server removes hardcoded date generation logic and delegates to Core
      methods
    checked: true
  - index: 7
    text: >-
      All existing server API endpoints continue to work without breaking
      changes
    checked: true
  - index: 8
    text: All tests pass after refactoring
    checked: true
  - index: 9
    text: Server layer contains only HTTP concerns (routing parsing responses)
    checked: true
  - index: 10
    text: Business logic is properly encapsulated in Core class
    checked: true
definition_of_done: []
comments: []
---
