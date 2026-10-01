---
task_schema_version: 2
id: BACK-509
title: Fix CLI auto-commit for doc/decision/task create commands
status: Done
assignee:
  - '@claude'
created_date: '2026-05-07 12:16'
updated_date: '2026-07-10 19:33'
labels: []
dependencies: []
ordinal: 108000
description: >-
  The 6 tests in src/test/cli-commit-behaviour.test.ts always fail. The test
  helper getCommitCountInTest uses 'git rev-list --all --count' to measure the
  commit count before and after a CLI command. A global git-ai tool (configured
  via trace2.eventTarget in ~/.gitconfig) asynchronously creates ref commits
  under refs/notes/ai for every git commit. 'git rev-list --all --count'
  includes these notes-ref commits in its total, inflating the count. The
  sibling tests in cli.test.ts use 'git rev-list --count HEAD' and pass, because
  HEAD only counts commits reachable from the current branch tip.
implementation_plan: >-
  Change the commit counting helper in cli-commit-behaviour.test.ts from 'git
  rev-list --all --count' to 'git rev-list --count HEAD'. This scopes the count
  to commits reachable from HEAD on the current branch, excluding refs/notes/*
  and any other side refs. No implementation changes are required — the commit
  logic in Core (shouldAutoCommit, createDocumentFromInput, createDecision)
  already reads autoCommit from config correctly via
  shouldAutoCommit(undefined).
implementation_notes: >-
  Root cause: getCommitCountInTest used 'git rev-list --all --count' which
  includes refs/notes/ai commits created asynchronously by a global git-ai
  daemon (trace2.eventTarget in ~/.gitconfig). These notes commits inflate the
  count non-deterministically.


  Fix: Changed to 'git rev-list --count HEAD' in
  src/test/cli-commit-behaviour.test.ts.


  The underlying autoCommit implementation in Core was already correct —
  shouldAutoCommit(undefined) reads config and all three CLI handlers
  (task/doc/decision create) correctly defer to it.


  Commit: 879fbca
final_summary: >-
  Fixed all 6 failing tests in src/test/cli-commit-behaviour.test.ts by
  replacing 'git rev-list --all --count' with 'git rev-list --count HEAD' in the
  test helper. The --all flag was counting refs/notes/ai commits from a global
  git-ai trace2 tool, making counts non-deterministic. One-character change:
  --all → HEAD. Commit: 879fbca
acceptance_criteria:
  - index: 1
    text: >-
      autoCommit: true config causes a new git commit when running 'backlog task
      create',autoCommit: true config causes a new git commit when running
      'backlog doc create',autoCommit: true config causes a new git commit when
      running 'backlog decision create',All three cli-commit-behaviour.test.ts
      autoCommit:true tests pass,bun test shows no new test failures
    checked: true
  - index: 2
    text: >-
      All 6 tests in src/test/cli-commit-behaviour.test.ts pass,bun test shows
      no new test failures vs pre-existing baseline,bunx tsc --noEmit passes,bun
      run check . passes
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
