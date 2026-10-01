---
task_schema_version: 2
id: BACK-251
title: 'Board: harden remote branch normalization to avoid origin/origin refs'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-04 19:34'
updated_date: '2025-09-04 20:18'
labels:
  - bug
  - board
  - git
dependencies: []
priority: high
description: >-
  Follow-up to GitHub issue #315. Running backlog board can fail with git
  ls-tree errors against origin/origin when branch normalization lets invalid
  entries (e.g., origin, origin/HEAD, origin/origin) through, producing a
  malformed ref origin/origin.


  Goal: Harden normalization so only canonical remote refs are used and invalid
  entries are filtered, preventing board load failures.
implementation_plan: |-
  1. Harden normalization in listRecentRemoteBranches (drop HEAD/origin)
  2. Keep normalizeRemoteBranch robust (already filters origin/HEAD)
  3. Add tests covering invalid entries and canonical refs
  4. Verify remoteOperations=false path remains local only
implementation_notes: >-
  Hardened branch normalization to prevent malformed refs (origin/origin).
  listRecentRemoteBranches now filters HEAD and entries that would normalize to
  empty or origin; normalizeRemoteBranch drops stray origin after stripping
  prefix. Extended tests verify no origin/origin refs are passed to git
  operations.
acceptance_criteria:
  - index: 1
    text: >-
      backlog board runs without git ls-tree errors related to origin/origin; no
      malformed refs are used.
    checked: true
  - index: 2
    text: >-
      normalizeRemoteBranch handles inputs: origin, origin/HEAD, origin/origin,
      refs/remotes/origin/origin (filtered), and origin/main,
      refs/remotes/origin/main, main (normalized to use origin/main only).
    checked: true
  - index: 3
    text: >-
      Unit tests cover these cases in task-loader-branch-normalization.test.ts;
      no call to listFilesInTree/getBranchLastModifiedMap receives
      origin/origin.
    checked: true
  - index: 4
    text: >-
      listRecentRemoteBranches filters out origin/HEAD and entries that
      normalize to empty or origin; add a small test if needed.
    checked: true
  - index: 5
    text: >-
      With remoteOperations=false, board loads using local tasks without
      attempting remote refs.
    checked: true
definition_of_done: []
comments: []
---
