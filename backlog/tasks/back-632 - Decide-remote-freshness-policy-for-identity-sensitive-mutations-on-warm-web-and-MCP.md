---
task_schema_version: 2
id: BACK-632
title: >-
  Decide remote-freshness policy for identity-sensitive mutations on warm web
  and MCP
status: To Do
assignee: []
created_date: '2026-08-10 07:45'
labels: []
dependencies: []
priority: medium
ordinal: 268000
description: >-
  Codex P1 on PR #899 (BACK-624), deferred from the v1.50.1 hotfix. In a warm
  web/MCP process the corpus loader's 60s remote-refresh lease also covers
  store.refreshTasks() from loadTaskForMutation (src/core/backlog.ts:3511 area
  at head 597ea2f0), so a differently-named same-ID task pushed by another clone
  within the lease window is not seen by resolveTaskForMutation and an
  edit/complete/archive proceeds against the local task instead of failing
  closed. Damage is bounded: the local edit is not lost, the pushed task is
  untouched, and the ambiguity is detected at the next refresh (60s max), after
  which reads fail closed until repaired with doctor. The #899 verification
  round probed read-path remote freshness as 'same as base', so this may be
  pre-existing rather than a #899 regression - confirm that first. Fix needs a
  design decision, since force-fetching per mutation (Codex's suggestion,
  symmetric with ID allocation) would reintroduce network-bound edits on warm
  web processes: options include a shorter mutation-path lease, a bounded
  force-fetch only for mutations arriving on IDs with known cross-branch copies,
  or a post-mutation ambiguity sweep. Related freshness-window tasks: BACK-627,
  BACK-628.
acceptance_criteria:
  - index: 1
    text: >-
      Baseline behavior confirmed: whether v1.50.0 and the #898 base actually
      fetched per mutation identity check in warm processes
    checked: false
  - index: 2
    text: >-
      A decided and documented freshness policy for identity-sensitive
      mutations, implemented with tests
    checked: false
  - index: 3
    text: Warm web edit latency does not become network-bound in the common case
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
