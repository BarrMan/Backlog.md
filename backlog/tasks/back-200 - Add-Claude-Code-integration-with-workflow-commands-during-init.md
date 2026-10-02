---
task_schema_version: 2
id: BACK-200
title: Add Claude Code integration with workflow commands during init
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2025-07-23'
updated_date: '2026-10-02 14:18'
labels:
  - enhancement
  - developer-experience
dependencies:
  - task-24.1
  - task-208
priority: medium
description: >-
  Enable users to leverage Claude Code's custom commands feature by generating a
  .claude directory with pre-configured workflow prompts when running 'backlog
  init'. This will streamline common backlog.md workflows like parsing PRDs,
  planning tasks, managing branches, and conducting code reviews.


  Based on contribution from PR #235:
  https://github.com/MrLesk/Backlog.md/pull/235
implementation_notes: >-
  Verified: Claude Code documents project skills at
  .claude/skills/<name>/SKILL.md and still supports .claude/commands/*.md; the
  documented command registration mechanism does not use claude.yaml
  (https://code.claude.com/docs/en/slash-commands). Referenced PR #235 is
  closed. Existing init tests cover a separate opt-in Claude project-manager
  agent. Task view reports unresolved dependencies task-24.1 and task-208.

  Blocker: acceptance criteria #4 and #8 require claude.yaml generation/merging,
  which does not match the documented integration. Recommendation pending Alex
  approval: use project skills for the eight named workflows and preserve
  existing user files on repeated init; revise those criteria before
  implementation. No implementation or test execution yet.
acceptance_criteria:
  - index: 1
    text: Claude Code template files are stored in src/templates/claude/
    checked: false
  - index: 2
    text: >-
      backlog init copies .claude directory to user's project with workflow
      commands
    checked: false
  - index: 3
    text: >-
      Commands include: parse-prd, plan-task, suggest-next-task, daily-standup,
      finish-task, branch-status, cleanup-branches, milestone-review
    checked: false
  - index: 4
    text: Generated claude.yaml references local workflow markdown files correctly
    checked: false
  - index: 5
    text: Documentation updated to explain Claude Code integration
    checked: false
  - index: 6
    text: >-
      init command prompts user whether to include Claude Code integration
      (similar to agent instructions)
    checked: false
  - index: 7
    text: >-
      Init wizard asks user if they want to add Claude Code commands during
      setup
    checked: false
  - index: 8
    text: >-
      If .claude/claude.yaml already exists, merge new commands intelligently
      (append new commands, preserve existing ones)
    checked: false
definition_of_done: []
comments: []
---
