---
task_schema_version: 2
id: BACK-461
title: Add community tools section to README
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-05-03 10:53'
updated_date: '2026-05-03 11:02'
labels:
  - docs
  - community
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/515'
modified_files:
  - README.md
priority: low
description: >-
  Track PR #515, which adds a small Community Tools section to the main README
  so users can discover community-maintained integrations without treating them
  as official core features. The current contribution links the
  vscode-backlog-md extension and its source repository.
implementation_plan: >-
  1. Push BACK-461 to main as the non-conflicting task for PR #515.

  2. Update PR #515 to remove the conflicting BACK-451 task file and
  retitle/reference BACK-461.

  3. Wait for CI and Codex on the updated PR branch before marking the task
  Done.
final_summary: >-
  Merged PR #515 after rebasing it onto current main, removing the conflicting
  BACK-451 task file from the contributor branch, updating the PR title/body to
  BACK-461, approving and waiting for fork CI, and receiving Codex
  no-major-issues approval. The merged diff adds a Community Tools README
  section with links to vscode-backlog-md on the Visual Studio Marketplace and
  GitHub.
acceptance_criteria:
  - index: 1
    text: >-
      README includes a Community Tools section near the existing
      documentation/footer area.
    checked: true
  - index: 2
    text: >-
      The vscode-backlog-md entry links both the Visual Studio Marketplace
      listing and source repository.
    checked: true
  - index: 3
    text: >-
      The PR title/body/task references use this new task ID instead of the
      conflicting BACK-451 ID.
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
