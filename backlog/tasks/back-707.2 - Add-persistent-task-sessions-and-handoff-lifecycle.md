---
task_schema_version: 2
id: BACK-707.2
title: Add persistent task sessions and handoff lifecycle
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-28 14:05'
updated_date: '2026-09-28 15:36'
labels: []
dependencies: []
parent_task_id: BACK-707
ordinal: 339000
description: >-
  Implement tmux sessions, task worktree reuse, active/history state,
  preparation, terminal capture/input/attach, and explicit single-document
  handoff with replacement and recovery.
implementation_plan: >-
  1. Inspect the durable session store, worker continuation, tmux adapter, and
  handoff cursor detection against the AOE reconstruction boundaries. 2. Correct
  only concrete dispatch, recovery, replacement ownership, and handoff-document
  lifecycle defects. 3. Add focused fake-runner reconstruction/restart coverage
  and retain an optional real-tmux smoke test. 4. Run scoped
  runtime/config/bootstrap/CLI checks, formatting, and type checking.
implementation_notes: >-
  Reworked session lifecycle locking, canonical task identity, launch failure
  handling, durable output fallback, and handoff replacement. Added agent
  session runtime lifecycle tests and passed an isolated real tmux smoke test.


  Implemented draft-safe automatic tmux handoff dispatch, replacement
  snapshots/worktree reuse, state-lock hardening, and persistent single-document
  reuse. Verified: bun test --timeout=15000 src/test/agent-sessions.test.ts;
  bunx tsc --noEmit; bun run check src/agent-workspace/sessions.ts
  src/agent-workspace/types.ts src/test/agent-sessions.test.ts.


  Reopened before integration. Corrected stable handoff document
  deletion/recreation, strict provider prompt fixtures, persisted dispatch
  claims, historical preview, and nested attach environment. Targeted
  verification remains green; task is intentionally not finalized pending main
  integration.


  Stabilized recovery so a persisted failed replacement is retried by recover
  without creating another active session. Added reconstructed-service coverage,
  cursor-row handoff detection coverage, and an opt-in real-tmux fake-agent
  transport test with prompt readiness and cleanup. Verified default focused
  suite (23 pass, 1 optional skip) and RUN_INTERACTIVE_TUI_TESTS=1 with
  /opt/homebrew/bin/tmux (6 pass).
final_summary: >-
  Handoff requests are now automatically delivered when an idle prompt is
  stable, without overwriting a draft. Session starts/replacements are
  serialized and snapshot-preserving; lifecycle state and the single handoff
  document are durable. Verified with fake and real tmux agent lifecycle tests.
acceptance_criteria:
  - index: 1
    text: >-
      Session lifecycle and handoff are exercised including launch failure,
      duplicate requests, persistence, and first-session status transition
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
