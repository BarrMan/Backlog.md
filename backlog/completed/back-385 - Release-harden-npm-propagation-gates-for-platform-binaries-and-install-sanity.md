---
task_schema_version: 2
id: BACK-385
title: 'Release: harden npm propagation gates for platform binaries and install-sanity'
status: Done
assignee:
  - '@codex'
created_date: '2026-02-11 22:36'
updated_date: '2026-02-11 22:38'
labels: []
dependencies: []
references:
  - >-
    https://github.com/MrLesk/Backlog.md/actions/runs/21924056436/job/63312529781
  - 'https://github.com/MrLesk/Backlog.md/issues/489'
priority: high
description: >-
  Intermittent release failures on run 21924056436 (attempts 1-6) show `Binary
  package not installed for linux-x64` during install-sanity right after
  publishing v1.35.7. Root cause is npm registry propagation lag: `backlog.md`
  can resolve before its optional platform package is consistently installable.
  Implement workflow hardening so npm publish and install sanity checks are
  resilient to propagation delays without relying on lifecycle scripts.
implementation_notes: >-
  Updated `.github/workflows/release.yml` to add a new
  `verify-platform-packages` job (matrix across ubuntu/macos/windows) that waits
  with bounded retries for platform package installability and, on Linux, for
  all platform package metadata visibility. Rewired `npm-publish` to depend on
  that verification job. Converted `install-sanity` (unix/windows) from one-shot
  install checks to bounded retry loops with diagnostics (`npm ls --depth=1`,
  expected optional package presence) and set `fail-fast: false` for matrix
  visibility.
final_summary: >-
  Implemented release pipeline hardening for npm propagation lag. `npm-publish`
  now waits on a new verification gate that retries until platform packages are
  visible/installable. `install-sanity` now retries with diagnostics instead of
  failing on first propagation miss. Verified YAML syntax and ran `bun run check
  .github/workflows/release.yml` successfully.
acceptance_criteria:
  - index: 1
    text: >-
      Add release workflow job(s) that wait/retry until published platform
      package metadata/installability is visible before continuing.
    checked: true
  - index: 2
    text: >-
      Gate `npm-publish` on the new verification job(s), keeping existing
      build/publish structure intact.
    checked: true
  - index: 3
    text: >-
      Make `install-sanity` jobs retry with bounded attempts and log useful
      diagnostics (`npm ls`, expected package info) before failing.
    checked: true
  - index: 4
    text: >-
      Keep existing user install command/API behavior unchanged (`npm i
      backlog.md`, `npx backlog -v`).
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
