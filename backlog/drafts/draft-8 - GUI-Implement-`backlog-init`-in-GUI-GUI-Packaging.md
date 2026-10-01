---
task_schema_version: 2
id: DRAFT-8
title: 'GUI: Implement `backlog init` in GUI & GUI Packaging'
status: To Do
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-04'
labels:
  - gui
  - feature
milestone: M3 - GUI
dependencies:
  - task-8
description: >-
  - Implement a GUI mechanism to perform the `backlog init` action

  - Set up build process for the Tauri build tool to create distributable
  packages.

  - Implement the `backlog gui` command in the CLI to launch the packaged GUI
  application or guide download.
acceptance_criteria:
  - index: 1
    text: GUI can initialize a new Backlog.md project.
    checked: false
  - index: 2
    text: 'GUI can be packaged into distributable formats (.exe, .dmg, .AppImage).'
    checked: false
  - index: 3
    text: >-
      `backlog gui` command in CLI successfully launches the GUI or provides
      download instructions.
    checked: false
definition_of_done: []
comments: []
---
