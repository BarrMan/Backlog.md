---
task_schema_version: 2
id: BACK-167
title: Add --notes option to task create command
status: Done
assignee:
  - '@claude'
created_date: '2025-07-08'
updated_date: '2025-07-08'
labels: []
dependencies: []
description: >-
  The task create command was missing the --notes option, which is available in
  task edit. Users expect to be able to add implementation notes when creating
  tasks, similar to how they can add --plan, --ac, etc. This creates
  inconsistency in the CLI interface.
implementation_plan: >-
  1. Add --notes option to CLI parser in src/cli.ts (line ~374) after --plan
  option

  2. Add notes handling logic in task create action (line ~425) similar to
  existing --plan handling

  3. Import updateTaskImplementationNotes function from markdown/serializer.ts

  4. Test the implementation works correctly

  5. Verify all acceptance criteria are met
implementation_notes: >-
  ## Approach Taken


  Implemented --notes option by following the existing pattern used by --plan
  option. Added the CLI option parser and the handling logic in the task
  creation flow.


  ## Features Implemented


  - Added --notes option to task create command CLI parser

  - Added notes handling logic that calls updateTaskImplementationNotes from
  markdown/serializer.ts

  - Implementation follows same pattern as existing --plan option for
  consistency


  ## Technical Decisions


  - Placed --notes option after --plan option in CLI parser for logical grouping

  - Used same async import pattern as --plan to avoid circular dependencies

  - Reused existing updateTaskImplementationNotes function from markdown
  serializer


  ## Modified Files


  - src/cli.ts: Added --notes option and handling logic (lines 374, 425-429)

  - src/test/implementation-notes.test.ts: Added comprehensive tests for --notes
  option in task create command
acceptance_criteria:
  - index: 1
    text: CLI option --notes is added to task create command
    checked: true
  - index: 2
    text: '--notes option appears in task create help text'
    checked: true
  - index: 3
    text: >-
      --notes option works when creating tasks (creates Implementation Notes
      section)
    checked: true
  - index: 4
    text: Implementation is consistent with existing --plan option
    checked: true
  - index: 5
    text: All existing tests continue to pass
    checked: true
  - index: 6
    text: Unit tests cover --notes option functionality
    checked: true
definition_of_done: []
comments: []
---
