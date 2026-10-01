---
task_schema_version: 2
id: BACK-370
title: 'Release: publish platform binaries before main npm package'
status: Done
assignee:
  - '@codex'
created_date: '2026-01-21 21:05'
updated_date: '2026-01-21 21:18'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/489'
  - 'https://github.com/MrLesk/Backlog.md/actions/runs/21222914029'
  - 'https://github.com/MrLesk/Backlog.md/pull/494'
description: >-
  Mitigate optional dependency race by publishing platform-specific binary
  packages before publishing the main `backlog.md` package, so installs won't
  fail when binaries lag behind the main publish.
implementation_plan: >-
  1) Inspect .github/workflows/release.yml dependencies/needs to understand
  current publish order.

  2) Reorder jobs so publish-binaries runs before npm-publish while keeping
  build dependencies intact.

  3) Update install-sanity to depend on both publishes (publish-binaries +
  npm-publish) after reordering.

  4) Sanity-check workflow for circular dependencies; keep behavior equivalent
  aside from ordering.

  5) Summarize changes and note tests (none expected for workflow-only change
  unless requested).
implementation_notes: >-
  Updated release workflow ordering so `publish-binaries` runs before
  `npm-publish`, keeping `install-sanity` gated on both. No steps removed.


  Tests not run (workflow-only change).


  PR: https://github.com/MrLesk/Backlog.md/pull/494
acceptance_criteria:
  - index: 1
    text: >-
      Release workflow publishes platform binary packages before the main
      `backlog.md` npm package.
    checked: true
  - index: 2
    text: Install sanity checks still run after both publishes.
    checked: true
  - index: 3
    text: Workflow ordering is updated without removing existing build steps.
    checked: true
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
