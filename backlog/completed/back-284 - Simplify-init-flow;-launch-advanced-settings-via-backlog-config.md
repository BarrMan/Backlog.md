---
task_schema_version: 2
id: BACK-284
title: Simplify init flow; launch advanced settings via backlog config
status: Done
assignee:
  - '@codex'
created_date: '2025-10-05 11:17'
updated_date: '2025-10-12 16:52'
labels:
  - cli
  - init
  - config
dependencies: []
description: >-
  Goal: Make backlog init minimal and move advanced settings to run under
  backlog config when opted in.


  Summary

  - Keep agent instruction selection in init.

  - After that, ask a single confirm: "Configure advanced settings now? (y/N)".

  - If Yes: immediately run `backlog config` (interactive wizard) and then
  finish init.

  - If No (default): finish init with safe defaults; no other prompts.

  - Preserve all existing flags and non-interactive behavior for backward
  compatibility.


  Context

  Init currently prompts for many settings (branch checks, remote, zero-padding,
  editor, web UI, etc.). We want a faster first-run and make advanced choices
  accessible via a dedicated interactive flow at `backlog config` (no
  subcommand).
implementation_plan: >-
  1. Extract the existing advanced init prompts into a reusable helper and wire
  it as the default `backlog config` wizard.

  2. Rework `backlog init` interactive flow to only ask for project name, agent
  instructions, and the advanced-settings confirm that launches the wizard when
  accepted.

  3. Update docs and automated tests to match the new flow, ensuring defaults
  and flag-based behaviors remain unchanged.
implementation_notes: >-
  - Extended init integration prompt with ESC handling, highlight fallback, MCP
  client automation, and summary outputs for MCP/CLI/no AI paths.

  - Adjusted non-interactive defaults to prefer MCP, enforced invalid flag
  combinations, and updated template/README links.

  - Tests now cover MCP default, CLI agent selections, and skip behavior under
  new flow.
acceptance_criteria:
  - index: 1
    text: >-
      Init prompts only: project name ➜ agent instruction selection ➜ advanced
      confirm (default No).
    checked: true
  - index: 2
    text: >-
      If user selects Yes, launch `backlog config` interactive wizard
      immediately and return to complete init.
    checked: true
  - index: 3
    text: >-
      Implement default action for `backlog config` (no args) to run an advanced
      interactive wizard; keep `config list|get|set` working unchanged.
    checked: true
  - index: 4
    text: >-
      Remove other prompts from init (zero-padding, editor, cross-branch, web
      UI, git hooks) unless advanced=Yes path is taken (then handled in wizard).
    checked: true
  - index: 5
    text: >-
      Honor all existing init flags and `--defaults` to remain non-interactive
      and not auto-launch the wizard.
    checked: true
  - index: 6
    text: >-
      Re-init: prefill project name with existing; rerun agent selection;
      advanced confirm behaves the same; wizard preloads current config values.
    checked: true
  - index: 7
    text: >-
      Post-init summary shows project name and which agent instruction files
      were created/skipped; no advanced details unless wizard ran.
    checked: true
  - index: 8
    text: >-
      backlog config wizard includes: cross-branch (checkActiveBranches,
      remoteOperations, activeBranchDays), git behavior (bypassGitHooks,
      autoCommit), ID formatting (zeroPaddedIds width/disabled), editor
      (defaultEditor with availability check), web UI (defaultPort,
      autoOpenBrowser).
    checked: true
  - index: 9
    text: >-
      Defaults when wizard is skipped: checkActiveBranches=true,
      remoteOperations=true, activeBranchDays=30, bypassGitHooks=false,
      zeroPaddedIds disabled, defaultEditor unset, defaultPort=6420,
      autoOpenBrowser=true.
    checked: true
  - index: 10
    text: >-
      Docs: Update README init section and mention `backlog config` for advanced
      options; update any references in AGENTS.md if needed.
    checked: true
  - index: 11
    text: >-
      Tests: add/adjust tests for new init flow ordering, advanced confirm
      default=No, and `backlog config` default action; keep existing tests
      passing (agent files, flags, non-interactive).
    checked: true
  - index: 12
    text: >-
      Backwards compatibility: existing scripts/CI using init flags or
      `--defaults` continue to work without wizard launch or extra prompts.
    checked: true
  - index: 13
    text: >-
      Code style/quality: Biome passes; type-check passes; no regressions in TUI
      flows; final summary output remains concise.
    checked: true
definition_of_done: []
comments: []
---
