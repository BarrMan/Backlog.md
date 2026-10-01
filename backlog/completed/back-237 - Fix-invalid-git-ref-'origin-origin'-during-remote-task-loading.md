---
task_schema_version: 2
id: BACK-237
title: Fix invalid git ref 'origin/origin' during remote task loading
status: Done
assignee:
  - '@codex'
created_date: '2025-08-17 16:42'
updated_date: '2025-08-26 20:28'
labels:
  - git
  - bug
  - remote
dependencies: []
priority: high
description: >-
  While running `backlog browser`, a warning can appear:


  Skipping branch origin: Error: Git command failed (exit code 128): git ls-tree
  -r --name-only -z origin/origin -- backlog/tasks


  Root cause (likely): our remote task indexing builds refs as
  `origin/${branch}` (see buildRemoteTaskIndex). If `branch` is already
  `origin/<name>` (or an invalid entry like `origin`/`origin/HEAD`), we end up
  with an invalid ref (e.g., `origin/origin`, `origin/origin/HEAD`).


  Fix scope:

  - Sanitize branch inputs accepted by the remote indexer to a single canonical
  form: `origin/<branch>`

  - Accept and normalize: `main`, `origin/main`, `refs/remotes/origin/main`

  - Filter out non-branch entries: bare `origin`, `origin/HEAD`, and `HEAD`

  - Add tests for normalization and for skipping invalid entries

  - Verify the warning disappears when running `backlog browser`.
implementation_notes: >-
  Normalize remote branch inputs for remote task loading: accept 'main',
  'origin/main', 'refs/remotes/origin/main' and map to canonical
  'origin/<branch>'; filter invalid refs like 'origin', 'origin/HEAD', 'HEAD'.
  Added tests for normalization and invalid-ref filtering; verified no warnings
  when running browser.
acceptance_criteria:
  - index: 1
    text: >-
      Normalize remote branch inputs to canonical ref: origin/<branch>, without
      double-prefix
    checked: true
  - index: 2
    text: >-
      Filter out invalid refs: HEAD, origin, origin/HEAD; do not query Git for
      these
    checked: true
  - index: 3
    text: >-
      Accept inputs in any of: main | origin/main | refs/remotes/origin/main and
      normalize identically
    checked: true
  - index: 4
    text: >-
      Add tests for buildRemoteTaskIndex branch normalization and invalid-ref
      filtering
    checked: true
  - index: 5
    text: >-
      Manual verification: run backlog browser; the previous warning does not
      appear anymore
    checked: true
definition_of_done: []
comments: []
---
