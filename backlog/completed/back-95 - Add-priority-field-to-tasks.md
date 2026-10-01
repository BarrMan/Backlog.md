---
task_schema_version: 2
id: BACK-95
title: Add priority field to tasks
status: Done
assignee:
  - '@claude'
created_date: '2025-06-20'
updated_date: '2025-06-20'
labels:
  - enhancement
dependencies: []
description: |-
  Add support for assigning a priority level to each task so that work can be
  ordered by importance. The CLI should allow setting the priority when creating
  or editing tasks, and the board view should display it.
implementation_plan: |-
  1. Update Task type to include priority (high|medium|low)
  2. Extend CLI create/edit with `--priority` option
  3. Display priority in list and board
  4. Update docs and tests
implementation_notes: "Successfully implemented priority field functionality across the entire Backlog.md codebase:\n\n### Technical Implementation\n- **Task Type Definition**: Added optional `priority?: \"high\" | \"medium\" | \"low\"` field to the Task interface in `/src/types/index.ts`\n- **CLI Support**: Added `--priority` flag to both `task create` and `task edit` commands with validation for valid priority values (high, medium, low)\n- **Markdown Parsing**: Updated `parseTask()` function to parse priority from frontmatter with case-insensitive validation\n- **Markdown Serialization**: Updated `serializeTask()` function to include priority field in frontmatter when present\n- **Board Display**: Enhanced Kanban board to show priority indicators using colored emojis (\U0001F534 high, \U0001F7E1 medium, \U0001F7E2 low)\n- **Task Viewer**: Updated both interactive and plain-text task views to display priority information\n\n### Files Modified\n1. `/src/types/index.ts` - Added priority field to Task interface\n2. `/src/cli.ts` - Added --priority flag to create/edit commands with validation\n3. `/src/markdown/parser.ts` - Added priority parsing with validation\n4. `/src/markdown/serializer.ts` - Added priority serialization\n5. `/src/board.ts` - Added priority indicators to board display\n6. `/src/ui/task-viewer.ts` - Added priority display to task views\n7. `/src/test/priority.test.ts` - Comprehensive test suite for priority functionality\n\n### Key Features\n- **Priority Levels**: Three levels supported - high, medium, low\n- **Visual Indicators**: Color-coded emoji indicators in board view (\U0001F534\U0001F7E1\U0001F7E2)\n- **CLI Validation**: Invalid priority values are rejected with helpful error messages\n- **Case Insensitive**: Priority values accept mixed case (HIGH, High, high all work)\n- **Optional Field**: Priority is optional - existing tasks without priority continue to work\n- **Round-trip Support**: Priority values are preserved through parse/serialize cycles\n\n### Testing\nAdded comprehensive test suite covering:\n- Priority parsing from markdown frontmatter\n- All valid priority levels (high, medium, low)\n- Invalid priority value handling\n- Case-insensitive parsing\n- Serialization with and without priority\n- Round-trip parsing/serialization integrity\n\nAll tests pass and linting checks are clean."
acceptance_criteria:
  - index: 1
    text: Tasks support priority metadata
    checked: true
  - index: 2
    text: CLI accepts --priority
    checked: true
  - index: 3
    text: Board shows priority
    checked: true
  - index: 4
    text: Docs updated
    checked: true
  - index: 5
    text: Tests added
    checked: true
definition_of_done: []
comments: []
---
