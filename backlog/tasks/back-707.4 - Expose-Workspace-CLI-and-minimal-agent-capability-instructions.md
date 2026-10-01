---
task_schema_version: 2
id: BACK-707.4
title: Expose Workspace CLI and minimal agent capability instructions
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-28 14:05'
updated_date: '2026-09-28 15:38'
labels: []
dependencies: []
parent_task_id: BACK-707
ordinal: 341000
description: >-
  Expose session lifecycle/configuration and Workspace through canonical CLI.
  Provide token-minimal startup orientation and lazy capability guides; deliver
  bootstrap through supported agent launch interfaces.
implementation_plan: >-
  1. Verify shipped CLI lifecycle/configuration registration and worker-launch
  behavior against compiled and source CLI execution paths. 2. Correct concrete
  command or instruction-contract defects without changing the TUI. 3. Run
  focused CLI/bootstrap/config checks plus type and formatting validation.
implementation_notes: >-
  Implemented workspace CLI lifecycle, handoff, scoped configuration, lazy
  agent-workspace guide, and compact bootstrap launch rendering. Focused
  bootstrap and CLI integration tests pass; full typecheck remains blocked by
  concurrent Workspace TUI errors.


  Corrected built-in launch construction to preserve configured commands and
  flags, quote bootstrap file substitution as one argv value, and use supported
  installed agy prompt-interactive behavior. handoff-complete now starts
  handoff-continue as a detached CLI worker after persisting ready state. Added
  real argv and expanded CLI help tests.


  Changed agent-config mutation to copy the effective configuration in memory
  only, selectively update one preset, preserve other presets, reject duplicate
  creates, and support root scope outside initialized projects. Added
  retained-preset, copy-on-init, and root-outside-project CLI coverage.


  Verified source lifecycle coverage and a freshly compiled binary's
  agent-session help and agent-config root path. Focused
  runtime/config/bootstrap/CLI tests, owned-file Biome, and bunx tsc --noEmit
  pass.


  Enabled real-tmux fake-agent transport passed both source CLI and freshly
  compiled CLI paths; the compiled path exercises handoff-complete spawning the
  detached compiled continuation worker.
acceptance_criteria:
  - index: 1
    text: >-
      CLI lifecycle/configuration/help and bootstrap capability guides are
      tested and registered in shipped CLI
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
