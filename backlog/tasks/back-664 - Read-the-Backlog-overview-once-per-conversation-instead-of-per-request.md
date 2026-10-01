---
task_schema_version: 2
id: BACK-664
title: Read the Backlog overview once per conversation instead of per request
status: Done
assignee:
  - '@claude'
created_date: '2026-08-30 20:59'
updated_date: '2026-08-31 21:02'
labels:
  - cli
  - enhancement
dependencies: []
ordinal: 296000
description: >-
  The shipped agent nudge (src/guidelines/cli-agent-nudge.md, injected into
  AGENTS.md at init) instructs agents to run `backlog instructions overview`
  "for every user request", so agents re-read static content many times per
  conversation, wasting tokens (maintainer-observed across multiple agents).
  Change the trigger to once at the beginning of each conversation, re-reading
  only if it has not been read in the current conversation. The lifecycle guide
  triggers (task-creation/execution/finalization before those actions) stay as
  they are.
implementation_plan: >-
  Reword the overview trigger sentence in cli-agent-nudge.md, update the init
  test expectation, check for other copies of the sentence in shipped surfaces.
final_summary: >-
  Reworded the overview trigger in src/guidelines/cli-agent-nudge.md (the single
  source imported by guidelines/index.ts and injected at init/update) from
  per-request to once per conversation, updated this repo's AGENTS.md instance
  and the init test expectation. Verified with bunx tsc --noEmit, bun run check
  ., and src/test/cli-init-create.test.ts (44 pass).
acceptance_criteria:
  - index: 1
    text: >-
      The shipped nudge instructs reading the overview at the start of each
      conversation, not per request
    checked: true
  - index: 2
    text: >-
      Existing projects pick up the new wording via the documented
      instruction-update path
    checked: true
  - index: 3
    text: The init test asserting the old sentence is updated
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
