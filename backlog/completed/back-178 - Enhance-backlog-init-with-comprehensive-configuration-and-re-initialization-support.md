---
task_schema_version: 2
id: BACK-178
title: >-
  Enhance backlog init with comprehensive configuration and re-initialization
  support
status: Done
assignee:
  - '@claude'
created_date: '2025-07-12'
updated_date: '2025-07-13'
labels: []
dependencies: []
priority: high
description: >-
  Improve the backlog init command to prompt for key configuration options and
  support re-initialization with pre-selected values. Currently init only
  prompts for project name and agent files, missing important workflow settings.
  Re-running init overwrites existing configuration without preserving values.
implementation_plan: |-
  1. Modify init command to check for existing config.yml
  2. Load existing config values if found
  3. Add configuration prompts with intelligent defaults:
     - autoCommit (default: false, current value if re-init)
     - defaultEditor (detect from env/system, validate availability)
     - remoteOperations (default: true, explain offline implications)
     - Web UI settings (port/auto-open) if user wants them
  4. Pre-populate prompts with existing values during re-init
  5. Show configuration summary before saving
  6. Preserve non-prompted fields (statuses, labels, etc.)
  7. Update config migration to handle new fields
  8. Add comprehensive tests for init and re-init flows
  9. Update documentation
implementation_notes: >-
  CRITICAL IMPROVEMENTS:

  - Non-destructive re-initialization preserves existing config

  - Covers all important workflow preferences upfront

  - Reduces need for manual config editing after init

  - Better onboarding experience for new users


  PROMPT STRATEGY:

  - Group related prompts (e.g., web UI settings together)

  - Show current value in prompt when re-initializing

  - Provide sensible defaults based on environment

  - Skip optional prompts if user wants minimal setup


  FIELDS TO PROMPT FOR:

  1. projectName (required)

  2. autoCommit (workflow preference)

  3. defaultEditor (if not set in env)

  4. remoteOperations (for offline users)

  5. Web UI config (optional group):
     - defaultPort
     - autoOpenBrowser

  VALIDATION:

  - Editor command availability

  - Port number range (1-65535)

  - Project name requirements


  BACKWARDS COMPATIBILITY:

  - Existing projects work without these fields

  - Config migration handles missing fields

  - Tests ensure no regression


  Successfully enhanced the backlog init command with comprehensive
  configuration support and non-destructive re-initialization. Added prompts for
  autoCommit, defaultEditor (with env detection + validation), remoteOperations,
  and optional web UI settings (port/browser). Existing config values are
  preserved and pre-populated during re-init. Configuration summary is displayed
  before saving. Added comprehensive tests covering all scenarios. The enhanced
  init provides better onboarding for new users while preserving existing
  project configurations.
acceptance_criteria:
  - index: 1
    text: Detect if project is already initialized and load existing config values
    checked: true
  - index: 2
    text: Add prompts for key configuration fields during init
    checked: true
  - index: 3
    text: Pre-select existing values when re-initializing a project
    checked: true
  - index: 4
    text: Add autoCommit prompt with clear explanation of implications
    checked: true
  - index: 5
    text: Add defaultEditor prompt with validation
    checked: true
  - index: 6
    text: Add remoteOperations prompt for offline mode users
    checked: true
  - index: 7
    text: Add web UI configuration prompts (port and auto-open)
    checked: true
  - index: 8
    text: Preserve all non-prompted config values during re-init
    checked: true
  - index: 9
    text: Show summary of configuration before saving
    checked: true
  - index: 10
    text: Update tests to cover all new prompts and re-init scenarios
    checked: true
  - index: 11
    text: Document the enhanced init process in README
    checked: true
definition_of_done: []
comments: []
---
