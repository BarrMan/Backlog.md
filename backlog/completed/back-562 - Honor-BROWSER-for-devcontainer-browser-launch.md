---
task_schema_version: 2
id: BACK-562
title: Honor BROWSER for devcontainer browser launch
status: Done
assignee:
  - '@codex'
created_date: '2026-08-02 16:09'
updated_date: '2026-08-02 16:52'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/815'
  - 'https://github.com/MrLesk/Backlog.md/pull/817'
modified_files:
  - src/utils/browser-launch.ts
  - src/cli.ts
  - src/server/index.ts
  - src/test/server-browser-open.test.ts
type: bug
ordinal: 206000
description: >-
  Make backlog browser honor a non-empty BROWSER executable when opening the web
  UI, so VS Code devcontainers can forward the URL to the host browser while
  platform fallbacks remain intact.
implementation_plan: >-
  1. Review the merged browser-launch flow and focused tests. 2. Preserve the
  contributor fix while adapting it to current main and add only necessary
  behavior coverage. 3. Validate focused tests, repository checks, build, and
  the current-suite baseline before PR review.
implementation_notes: >-
  Merged current origin/main, replaced the duplicate BACK-555 task record with
  this CLI-allocated task, and verified focused browser tests, typecheck, Biome,
  build, plus CI-equivalent isolated full suites on origin/main and this branch.


  Updated PR #817 to BACK-562 and pushed the current-main merge plus identity
  repair. GitHub accepted the fast-forward branch update but rejected fork
  branch renaming because maintainer permissions do not grant that operation.


  Merged PR #817 after the current head passed GitHub CI on Ubuntu, macOS,
  Windows, Nix, and binary-smoke targets. The Windows unit retry passed after
  the earlier unrelated timeout.
final_summary: >-
  Honored non-empty BROWSER as a single executable with the UI URL passed
  separately, preserved platform fallbacks and manual-open guidance, and
  verified focused tests, type checks, Biome, build, full CI-equivalent suites,
  and green GitHub CI.
acceptance_criteria:
  - index: 1
    text: >-
      When BROWSER is non-empty, backlog browser launches that executable with
      the web UI URL as a separate argument.
    checked: true
  - index: 2
    text: >-
      When BROWSER is unset or empty, macOS, Windows, and Linux use their
      existing platform browser-launch fallbacks.
    checked: true
  - index: 3
    text: >-
      If automatic opening fails, browser output still gives users a URL and
      clear manual-open guidance.
    checked: true
  - index: 4
    text: Focused browser-launch tests cover the override and fallback behavior.
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
