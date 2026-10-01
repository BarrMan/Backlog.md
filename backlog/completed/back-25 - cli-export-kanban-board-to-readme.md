---
task_schema_version: 2
id: BACK-25
title: 'CLI: Export Kanban board to README'
status: Done
assignee: []
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels: []
dependencies: []
description: >-
  Implement new command backlog board export to append the board to README.md or
  specified output file.
implementation_notes: >-
  - Added `exportKanbanBoardToFile()` in `src/board.ts` to handle writing the
  board to a file.

  - New `board export` command in `src/cli.ts` gathers tasks (including remote)
  and uses this helper.

  - Supports `--output` option and defaults to `README.md`.

  - Ensures output file exists and appends the board while preserving content.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog board export` writes the kanban board to `README.md` if it
      exists.
    checked: true
  - index: 2
    text: Provide `--output <path>` option to save board to another file.
    checked: true
  - index: 3
    text: Automatically create the file if the specified path does not exist.
    checked: true
  - index: 4
    text: >-
      Appended content preserves existing file contents and adds the board at
      the end.
    checked: true
definition_of_done: []
comments: []
---
