---
task_schema_version: 2
id: BACK-254
title: 'Init: default ''No'' for Claude agent installation'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-04 19:53'
updated_date: '2025-09-04 20:16'
labels:
  - cli
  - init
  - agents
dependencies: []
priority: medium
description: >-
  Change `backlog init` to not add the Claude custom agent by default. The
  interactive confirm should default to No (pressing Enter = No).
  Non-interactive mode already defaults to false via `--install-claude-agent`
  flag.


  Goal: Make Claude agent an explicit opt-in during initialization, with clear
  prompt copy and docs.
implementation_plan: |-
  1. Change init prompt default to No
  2. Update prompt copy per spec
  3. Ensure non-interactive flag parsing unchanged
  4. Add minimal test to ensure default=false and flag true works
  5. Update docs/help text
implementation_notes: >-
  Interactive prompt now defaults to No with clarified copy. Non-interactive
  stays false unless `--install-claude-agent true` is provided. Added tests
  verifying non-interactive default and explicit opt-in. Docs/help mention
  remains accurate with the new default.
acceptance_criteria:
  - index: 1
    text: >-
      Interactive init: Claude agent confirm defaults to No; pressing Enter does
      not install it.
    checked: true
  - index: 2
    text: >-
      Prompt copy clarifies opt-in and target path: “Install Claude Code
      Backlog.md agent? (y/N) Adds to .claude/agents/”.
    checked: true
  - index: 3
    text: >-
      Non-interactive: default remains false; `--install-claude-agent true` opts
      in explicitly.
    checked: true
  - index: 4
    text: >-
      Update documentation/help to reflect the default change and the flag
      usage.
    checked: true
  - index: 5
    text: >-
      Add/adjust a minimal test to assert the prompt initial value is false and
      flag parsing still works.
    checked: true
definition_of_done: []
comments: []
---
