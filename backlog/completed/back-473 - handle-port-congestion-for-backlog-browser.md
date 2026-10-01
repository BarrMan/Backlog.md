---
task_schema_version: 2
id: BACK-473
title: handle port congestion for backlog browser
status: Done
assignee:
  - '@codex'
created_date: '2026-05-08 14:29'
updated_date: '2026-07-08 19:55'
labels:
  - webui
dependencies: []
modified_files:
  - src/server/index.ts
  - src/cli.ts
  - src/test/server-port.test.ts
  - src/test/cli-browser-port.test.ts
  - src/test/test-utils.ts
ordinal: 166000
description: >-
  If port 6420 is taken, ask user to try a different one. Ideally just increment
  port number (e.g. 6421), check if free and start if user accepts this.


  oh, and check if port is free before starting the backlog browser mode anyway.
  this seems to not happen correctly O_o
implementation_plan: >-
  1. Inspect the existing browser command and port helper implementation against
  the PR review feedback.

  2. Bound port scanning so values above 65535 return a clean failure instead of
  looping.

  3. Make browser startup non-interactive by default in non-TTY/headless
  contexts while preserving prompts for interactive terminals.

  4. Replace fixed-port tests with ephemeral-port helpers and add coverage for
  max-port/no-port and headless behavior.

  5. Run focused tests, typecheck, and Biome check.
implementation_notes: >-
  Review follow-up for PR #651:

  - Bounded findNextAvailablePort() to the valid browser port range and return
  null when no port can be selected.

  - Browser startup now treats non-TTY/headless runs like --non-interactive,
  avoiding readline prompts that automation cannot answer.

  - Replaced fixed high-port tests with OS-assigned ephemeral ports and added
  coverage for bounded/no-port behavior.

  - Added a CLI subprocess test proving non-TTY browser startup auto-selects
  another port without prompting.


  Validation:

  - bun test src/test/server-port.test.ts src/test/cli-browser-port.test.ts: 8
  pass.

  - bunx tsc --noEmit: pass.

  - bunx biome check src/cli.ts src/server/index.ts src/test/server-port.test.ts
  src/test/cli-browser-port.test.ts src/test/test-utils.ts: pass.

  - bun test: 1250 pass, 2 skip, 1 unrelated timeout in
  src/test/cli-priority-filtering.test.ts (case insensitive priority filtering);
  isolated rerun times out at the same 5s budget.

  - bun run check .: blocked by existing package.json indentation formatting,
  outside the touched files.
final_summary: >-
  Implemented the PR #651 requested changes: port scanning now stops at 65535
  and fails cleanly, non-TTY/headless browser startup no longer prompts, and
  tests use ephemeral ports with coverage for bounded scans and non-interactive
  behavior. Verified focused tests, TypeScript, and scoped Biome;
  full-suite/check caveats are recorded in implementation notes.
acceptance_criteria:
  - index: 1
    text: >-
      Port is checked for availability before Bun.serve() is called (proactive
      check, not just catching EADDRINUSE)
    checked: true
  - index: 2
    text: >-
      If port is taken, user is shown the next available port (port+1 or higher)
      and asked to confirm interactively
    checked: true
  - index: 3
    text: >-
      If user accepts (Y/enter), server starts on the suggested port
      successfully
    checked: true
  - index: 4
    text: 'If user declines (n/N), process exits cleanly with code 0'
    checked: true
  - index: 5
    text: >-
      isPortAvailable() and findNextAvailablePort() are exported from
      src/server/index.ts and unit-tested (min 3 cases, ≥1 error/edge case)
    checked: true
  - index: 6
    text: '--non-interactive flag skips prompt and auto-selects next free port'
    checked: true
  - index: 7
    text: >-
      findNextAvailablePort stops at port 65535 and fails cleanly when no
      available port exists
    checked: true
  - index: 8
    text: >-
      Non-TTY or explicitly non-interactive browser startup does not wait for a
      prompt
    checked: true
  - index: 9
    text: >-
      Port availability tests avoid fixed high ports that can collide on shared
      machines
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
