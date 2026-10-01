---
task_schema_version: 2
id: BACK-104
title: Add --notes flag to task edit command for implementation notes
status: Done
assignee:
  - '@claude'
created_date: '2025-07-03'
updated_date: '2025-07-03'
labels: []
dependencies: []
description: >-
  ## Acceptance Criteria


  - [x] Users can add implementation notes when marking task as done

  - [x] --notes flag accepts multi-line text

  - [x] Implementation notes are saved to task file under ## Implementation
  Notes section

  - [x] Command works with status update: backlog task edit <id> -s Done --notes
  'notes here'

  - [x] Notes are appended if section already exists
implementation_plan: |-
  1. Add --notes flag to task edit command parser
  2. Parse and validate notes input
  3. Implement logic to add/update Implementation Notes section in task content
  4. Ensure notes work with status updates (especially when marking as Done)
  5. Handle multi-line notes properly
  6. Write comprehensive tests
  7. Update CLI help documentation
implementation_notes: >-
  Successfully implemented --notes flag functionality. Added comprehensive test
  coverage and ensured proper integration

  with status updates.


  Complete implementation details:


  - Added --notes flag to CLI command parser ✓

  - Implemented updateTaskImplementationNotes function ✓

  - Created comprehensive test suite with 6 test cases ✓

  - Tested multi-line notes, appending behavior, and positioning ✓

  - All acceptance criteria have been met ✓


  Fixed timestamp issue to follow agent guidelines better. 


  Technical approach:

  - Removed automatic timestamp addition from implementation notes

  - Simplified notes formatting to focus on content

  - Added timeout and error handling to Windows CI tests
acceptance_criteria:
  - index: 1
    text: Users can add implementation notes when marking task as done
    checked: true
  - index: 2
    text: '--notes flag accepts multi-line text'
    checked: true
  - index: 3
    text: >-
      Implementation notes are saved to task file under ## Implementation Notes
      section
    checked: true
  - index: 4
    text: >-
      Command works with status update: backlog task edit <id> -s Done --notes
      'notes here'
    checked: true
  - index: 5
    text: Notes are appended if section already exists
    checked: true
definition_of_done: []
comments: []
---
