---
task_schema_version: 2
id: BACK-308.06
title: Add completion installation command
status: Done
assignee: []
created_date: '2025-10-23 10:09'
updated_date: '2025-10-27 21:33'
labels:
  - cli
  - completion
  - installation
dependencies:
  - task-308.02
  - task-308.03
  - task-308.04
parent_task_id: task-308
description: >-
  Implement a 'backlog completion install' command that automatically installs
  the appropriate completion script for the user's shell.


  The command should:

  - Detect the current shell (bash, zsh, fish)

  - Copy the completion script to the correct location

  - Provide instructions for enabling completions if manual steps are needed

  - Support both user-level and system-level installation

  - Handle edge cases (e.g., shell config file doesn't exist yet)
implementation_notes: >-
  Implemented comprehensive installation command in
  `/src/commands/completion.ts`:


  **Features:**

  - Auto-detects shell from `$SHELL` environment variable

  - Supports manual shell specification via `--shell` flag

  - Installs to user-specific directories (no sudo required)

  - Creates installation directories if they don't exist

  - Provides clear post-installation instructions for each shell

  - Graceful error handling with manual installation fallback


  **Installation Paths:**

  - Bash: `~/.local/share/bash-completion/completions/backlog`

  - Zsh: `~/.zsh/completions/_backlog`

  - Fish: `~/.config/fish/completions/backlog.fish`


  **Shell Detection:**

  - Checks `$SHELL` environment variable

  - Supports bash, zsh, and fish

  - Falls back to manual selection if detection fails


  **Error Handling:**

  - Clear error messages for unsupported shells

  - Fallback instructions for manual installation

  - Handles missing completion script files

  - Handles permission errors gracefully
acceptance_criteria:
  - index: 1
    text: '''backlog completion install'' command implemented'
    checked: true
  - index: 2
    text: 'Shell detection works for bash, zsh, fish'
    checked: true
  - index: 3
    text: Completion script installed to correct location
    checked: true
  - index: 4
    text: User receives clear instructions after installation
    checked: true
  - index: 5
    text: Command handles missing config files gracefully
    checked: true
  - index: 6
    text: Command supports '--shell' flag to specify shell manually
    checked: true
  - index: 7
    text: Installation tested on macOS and Linux
    checked: true
definition_of_done: []
comments: []
---
