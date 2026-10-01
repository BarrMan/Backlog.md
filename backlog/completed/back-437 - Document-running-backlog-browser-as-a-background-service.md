---
task_schema_version: 2
id: BACK-437
title: Document running backlog browser as a background service
status: Done
assignee:
  - '@brenoperucchi'
created_date: '2026-04-22 15:13'
updated_date: '2026-04-25 23:09'
labels:
  - docs
  - browser
dependencies: []
description: >-
  Add separate documentation showing how to keep `backlog browser --no-open`
  running in the background and auto-starting on boot on Linux (systemd user
  unit), macOS (launchd LaunchAgent), and Windows (NSSM or Scheduled Task). Add
  cross-references from README.md and CLI-INSTRUCTIONS.md without placing the
  full service recipes in the main README. Related: upstream issue #335
  (containerization) addresses a different deployment shape; this docs task
  covers the local-service use case.
implementation_plan: >-
  1. Draft the Running as a Service documentation covering systemd-user,
  launchd, and Windows (NSSM/Scheduled Task)

  2. Put the full service documentation in backlog/docs/doc-003 -
  Running-Backlog-Browser-as-a-Service.md instead of embedding it in README.md

  3. Add short cross-reference links in README.md and CLI-INSTRUCTIONS.md

  4. Renumber the task from conflicting BACK-414 to BACK-437

  5. Run bun run check .
final_summary: >-
  Added a separate `backlog/docs/doc-003 -
  Running-Backlog-Browser-as-a-Service.md` guide covering three OS recipes for
  keeping `backlog browser --no-open` alive and auto-starting on boot:

  - Linux / WSL2 via a systemd user unit + `loginctl enable-linger`

  - macOS via a launchd LaunchAgent plist

  - Windows via Scheduled Task (PowerShell) and NSSM


  README.md now keeps only a short link to the separate guide after the Web
  Interface section. CLI-INSTRUCTIONS.md points to the same separate guide from
  the Web Interface table.


  No source code touched.


  Follow-up: addressed multi-project setups on the same machine — each project
  gets a `<project>`-suffixed service name (systemd, launchd Label, Scheduled
  Task name, NSSM service name) and a distinct port. Added a callout note at the
  top of the section and a one-line pointer about systemd template units for
  users with many projects.


  Maintainer follow-up: moved the long-form content out of README.md into
  `backlog/docs/doc-003 - Running-Backlog-Browser-as-a-Service.md`, updated
  links, and renumbered the task from conflicting BACK-414 to BACK-437.
acceptance_criteria:
  - index: 1
    text: >-
      backlog/docs/doc-003 - Running-Backlog-Browser-as-a-Service.md documents
      how to run the Web UI as a local background service
    checked: true
  - index: 2
    text: >-
      Separate docs show a working systemd user unit snippet using 'backlog
      browser --no-open'
    checked: true
  - index: 3
    text: Separate docs include macOS launchd and Windows guidance
    checked: true
  - index: 4
    text: >-
      README.md links to the separate service documentation without embedding
      the full recipes
    checked: true
  - index: 5
    text: >-
      CLI-INSTRUCTIONS.md Web Interface table links to the separate service
      documentation
    checked: true
  - index: 6
    text: bun run check . passes for the docs-only change
    checked: true
  - index: 7
    text: >-
      Multi-project setups are called out explicitly (distinct service names +
      distinct ports per project)
    checked: true
definition_of_done:
  - index: 1
    text: TypeScript not touched; type-check not required
    checked: true
  - index: 2
    text: bun run check . passes
    checked: true
  - index: 3
    text: Docs-only change; source test suite not required
    checked: true
comments: []
---
