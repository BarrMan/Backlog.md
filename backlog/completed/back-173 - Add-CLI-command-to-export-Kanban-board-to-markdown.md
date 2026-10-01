---
task_schema_version: 2
id: BACK-173
title: Add CLI command to export Kanban board to markdown
status: Done
assignee:
  - '@claude'
created_date: '2025-07-12'
updated_date: '2025-07-12'
labels: []
dependencies: []
description: >-
  Provide a CLI command to export the current Kanban board to a markdown
  document. This enables users to easily share the board state, create reports,
  archive board snapshots, or store board data in version control. The exported
  markdown should be well-formatted and human-readable, containing all board
  columns and tasks with their essential metadata.


  The command should handle edge cases gracefully and provide clear feedback to
  users about the export process.
implementation_plan: >-
  1. Research existing CLI command structure and board functionality

  2. Add board export subcommand to CLI with file argument and --force flag

  3. Implement markdown table generation logic for board columns and tasks

  4. Add file operations with error handling for path validation and overwrite
  protection

  5. Test with various board states (empty, partial, full) and edge cases

  6. Add unit tests for export functionality and markdown formatting
implementation_notes: >-
  Successfully enhanced the existing board export command to meet all acceptance
  criteria. Modified the CLI command to use Backlog.md as default instead of
  README.md, added --force flag for overwrite confirmation, and completely
  rewrote the markdown generation to include proper headers with timestamp and
  project name. Updated the task format to use **task-ID** - Title with
  assignees and labels metadata. All tests updated and passing. The export now
  overwrites files instead of appending for cleaner output.
acceptance_criteria:
  - index: 1
    text: >-
      CLI command `backlog board export [file]` successfully creates a markdown
      file
    checked: true
  - index: 2
    text: Default export path is `Backlog.md` when no file argument is given
    checked: true
  - index: 3
    text: >-
      Command completes successfully and shows confirmation message with file
      path
    checked: true
  - index: 4
    text: >-
      Exported markdown uses a table format with columns representing board
      columns
    checked: true
  - index: 5
    text: >-
      Table has headers: "To Do", "In Progress", "Done" (or current board
      columns)
    checked: true
  - index: 6
    text: >-
      Each task appears as a table cell with format: `**task-ID** - Task Title
      (Assignees: X, Labels: Y)`
    checked: true
  - index: 7
    text: Empty columns show empty table cells
    checked: true
  - index: 8
    text: File includes header with export timestamp and project name
    checked: true
  - index: 9
    text: Table is properly formatted with markdown table syntax (aligned columns)
    checked: true
  - index: 10
    text: Command fails gracefully with clear error message for invalid file paths
    checked: true
  - index: 11
    text: Command warns user when attempting to overwrite existing files
    checked: true
  - index: 12
    text: User can force overwrite with `--force` flag without confirmation
    checked: true
  - index: 13
    text: Handles special characters in task titles without breaking markdown format
    checked: true
  - index: 14
    text: Works correctly with empty boards (no tasks)
    checked: true
  - index: 15
    text: 'Handles tasks with no assignees, labels, or other optional fields'
    checked: true
  - index: 16
    text: 'Processes board columns in consistent order (To Do, In Progress, Done)'
    checked: true
definition_of_done: []
comments: []
---
## Acceptance Criteria
<!-- AC:BEGIN -->
### Core Functionality

### Markdown Format

### Error Handling

### Edge Cases

Example expected output format:
```markdown
# Kanban Board Export (powered by Backlog.md)
Generated on: 2025-07-12 14:30:25
Project: MyProject

| To Do | In Progress | Done |
|-------|-------------|------|
| **task-5** - Implement user authentication (Assignees: @john, Labels: auth, backend) | **task-2** - Add dashboard UI (Assignees: @jane, Labels: frontend, ui) | **task-1** - Setup project structure (Assignees: @john, Labels: setup) |
| **task-3** - Fix login validation (Assignees: none, Labels: bug) | | |
```
<!-- AC:END -->