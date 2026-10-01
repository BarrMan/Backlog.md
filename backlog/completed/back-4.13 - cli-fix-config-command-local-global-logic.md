---
task_schema_version: 2
id: BACK-4.13
title: 'CLI: Fix config command local/global logic'
status: Done
assignee: []
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels: []
dependencies: []
parent_task_id: task-4
description: Fix config commands to correctly use local or global config files
implementation_notes: >-
  **CLI Command Implementation (src/cli.ts:497-548):**

  - Added `config get <key>` command that implements proper priority order:
  local config → global config → built-in defaults

  - Added `config set <key> <value>` command with `--local` and `--global` flags

  - `--local` flag (default behavior) saves to `.backlog/config.yml` in current
  project

  - `--global` flag saves to `~/.backlog/.user` in user's home directory

  - Built-in defaults include `statuses: ["Draft", "To Do", "In Progress",
  "Done"]` and `defaultStatus: "To Do"`


  **FileSystem Implementation (src/file-system/operations.ts:349-392):**

  - Added `getUserSetting(key, global)` method to read from user config files

  - Added `setUserSetting(key, value, global)` method to write to user config
  files

  - Global config stored in `~/.backlog/.user` (home directory)

  - Local config stored in `./.user` (project directory)

  - Supports key-value format with colon separation and optional quotes

  - Fixed `serializeConfig()` and `saveUserSettings()` to always include
  trailing newlines for proper file formatting


  **Configuration Priority Logic:**

  1. **Local config first**: Checks `.backlog/config.yml` for project-specific
  settings

  2. **Global config fallback**: Checks `~/.backlog/.user` for user-wide
  settings

  3. **Built-in defaults**: Falls back to hardcoded values for core settings
  like statuses


  **Documentation Updates (README.md:176-179):**

  - Added explanation of `--local` (default) and `--global` flags

  - Documented priority order: local → global → defaults

  - Updated usage examples to show flag usage

  - Clarified behavior for both `config get` and `config set` commands


  **Quality Assurance:**

  - All filesystem tests pass, including new user config operations test

  - Manual testing confirms proper flag behavior and priority order

  - CLI help text includes proper flag documentation

  - Implementation maintains backward compatibility with existing config
  operations


  The config commands now correctly handle local/global configuration with
  proper precedence rules, enabling users to maintain both project-specific and
  user-wide settings.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog config set <key> <value> --local` saves changes to
      `.backlog/config.yml`.
    checked: true
  - index: 2
    text: >-
      `backlog config set <key> <value> --global` saves changes to the user
      config file.
    checked: true
  - index: 3
    text: >-
      `backlog config get <key>` checks local config first, then global config,
      then defaults.
    checked: true
  - index: 4
    text: >-
      Behavior prioritizes local configuration over global and built-in
      defaults.
    checked: true
  - index: 5
    text: Documentation updated to describe local and global configuration behavior.
    checked: true
definition_of_done: []
comments: []
---
