---
task_schema_version: 2
id: BACK-261
title: 'Init: Handle missing git origin gracefully'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-07 19:57'
updated_date: '2025-09-07 20:15'
labels:
  - cli
  - git
  - init
  - bug
dependencies: []
priority: high
description: >-
  Currently, initialization fails when remote-branch features are enabled but
  the repository has no git remotes (e.g., no "origin"). Add a preflight check
  that inspects the current repository before any remote operations (fetch, list
  remote branches, push). If no remotes exist, skip remote-dependent steps and
  proceed in local-only mode with a clear, actionable message.
implementation_plan: >-
  1. Add git remote preflight helper in GitOperations (hasAnyRemote/hasRemote)

  2. Guard fetch: skip with clear warning when no remotes exist

  3. Short-circuit remote-branch listing when no remotes exist

  4. Update code paths that call fetch implicitly (doc/decision ID, remote
  loader) to rely on guarded fetch

  5. Add tests: fetch with no remotes, loadRemoteTasks no-remote, CLI init in
  no-remote repo

  6. Run type-check, lint, tests; ensure all pass
implementation_notes: >-
  Implemented git remote preflight for all remote operations.


  Summary

  - Added GitOperations.hasAnyRemote()/hasRemote() helpers

  - Guarded GitOperations.fetch() to skip when no remotes exist with clear
  warning

  - Short-circuited listRemoteBranches/listRecentRemoteBranches when no remotes

  - Relied on guarded fetch in doc/decision ID generation and remote loader

  - Added tests: no-remote preflight (fetch/log), loadRemoteTasks no-remote, CLI
  init in no-remote repo

  - Ran type-check, lint, and full test suite (all pass)


  Branch

  - tasks/task-261-handle-missing-git-origin
acceptance_criteria:
  - index: 1
    text: Init works in a repo with no git remotes (no origin) without crashing
    checked: true
  - index: 2
    text: >-
      Remote-dependent steps are guarded by a preflight check and are skipped
      when no remotes exist
    checked: true
  - index: 3
    text: >-
      User sees a clear message like: ‘No git remotes detected; skipping remote
      operations’
    checked: true
  - index: 4
    text: Behavior with remotes present remains unchanged (no regression)
    checked: true
  - index: 5
    text: Preflight helper is reused by init and any other remote-using code paths
    checked: true
  - index: 6
    text: Tests cover no-remote scenario; type-check and lint pass
    checked: true
definition_of_done: []
comments: []
---
