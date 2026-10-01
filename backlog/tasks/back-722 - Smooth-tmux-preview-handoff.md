---
task_schema_version: 2
id: BACK-722
title: Smooth tmux preview handoff
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-10-01 05:52'
updated_date: '2026-10-01 08:13'
labels:
  - tui
  - terminal
dependencies: []
type: enhancement
ordinal: 356000
description: >-
  Tmux full-screen takeover currently needs a stable preview lifecycle across
  the terminal session and TUI. Prepare the approved AoE-based handoff so
  implementation can preserve nested tmux-client attachment semantics, display a
  coherent windowed preview with cursor and geometry, and verify behavior in a
  real terminal.
implementation_plan: >-
  1. Inspect inline capture and geometry sequencing in the workspace controller
  and its focused navigation/session tests. 2. Use one generation-safe, bounded
  capture scheduler for input and inline polling without reload/recovery
  metadata work. 3. Serialize geometry work with session exit so stale
  resize/frame completions cannot revive the inline cursor; route all exits
  through synchronous leaveInline. 4. Add deferred-service coverage for no-input
  output, coalescing, resize exit ordering, filter focus, and Ctrl+Q; run
  focused tests and static checks.
implementation_notes: >-
  Final independent review approved. Verified RUN_INTERACTIVE_TUI_TESTS=1 bun
  test --timeout=30000 across the three focused agent-session, navigation, and
  PTY files (20 passing); bunx tsc --noEmit; and scoped Biome across the seven
  changed files. Nested tmux uses switch-client, while the workspace process
  remains in its own pane and AoE cleanup restores its Blessed lifecycle.
  Real-terminal evidence is limited to the AoE-equivalent tmux frame/input seam;
  it does not prove physical flicker-free rendering or a successful
  controlling-PTY detach.


  Reopened for approved workspace regression work. Details visibility now
  persists in WorkspaceViewState and Space toggles it; Right/L focuses details.
  Direct handoff reloads the canonical session state and resumes live preview on
  return, while nested tmux handoff preserves the hidden workspace and skips
  target resize. Focused tests, TypeScript, and scoped Biome pass; task remains
  In Progress pending independent review.


  Independent follow-up review approved. All 21 tests executed with
  RUN_INTERACTIVE_TUI_TESTS=1 bun test --timeout=30000 across agent-sessions,
  agent-workspace-navigation, agent-workspace-pty, and tmux-bindings: 21 passed,
  zero failures or skips. TypeScript, scoped Biome, and diff whitespace checks
  passed. Runtime tmux root C-q is now unconditional detach-client; persistent
  ~/.tmux.conf already matched. Private-socket Ctrl+Q test verifies real client
  detach without modifying the user server. UI seam tests verify Details toggle
  and live output after new/existing direct handoff; no physical flicker-free
  claim.


  Regression fix: inline preview refreshes now use a one-frame (16ms) coalescing
  window, carry the inline generation through deferred resize/frame work, and
  are canceled after exit; the renderer hides the physical preview cursor
  outside inline mode, so Ctrl+Q hides it synchronously and a released stale
  frame cannot restore it. Poll recovery/reload is paused during inline input.
  Successful tmux paste no longer issues an extra delete-buffer after
  paste-buffer -d, reducing the normal per-character backend sequence from three
  tmux commands to two. Focused navigation/session tests: 18 passed, 1 gated
  real-tmux skip; bunx tsc --noEmit, scoped Biome, and git diff --check passed.
  Task remains In Progress pending independent review, per requirement.


  Correction pass: inline preview now has a 250ms inline-only cadence routed
  through the same 16ms, single-flight scheduler as input refreshes;
  recovery/reload remains excluded while inline. Geometry operations serialize
  resize and reset so Ctrl+Q hides synchronously, resets after any deferred
  resize, and re-entry resizes again. Filter focus uses leaveInline. Added
  deferred capture, remote-output, and resize-exit coverage. Verified 20 passing
  focused tests with one gated tmux skip, TypeScript, scoped Biome, and
  whitespace check.


  Final independent review approved. The prior input latency came from
  deliberate 75ms waits plus tmux command round trips; this correction uses a
  16ms coalesced input refresh and a 250ms inline-only idle refresh. Cursor
  rendering is restricted to inline mode, and reset is ordered after queued
  resize before re-entry. Verified with RUN_INTERACTIVE_TUI_TESTS=1 bun test
  --timeout=30000 src/test/agent-workspace-navigation.test.ts
  src/test/agent-sessions.test.ts src/test/agent-workspace-pty.test.ts
  src/test/tmux-bindings.test.ts (24 pass, 0 fail, 22.25s), bunx tsc --noEmit,
  scoped Biome, and git diff --check. This review does not claim a measured
  five-second latency.
final_summary: >-
  Smoothed inline tmux preview handoff with a 16ms coalesced refresh and 250ms
  inline idle refresh, cursor visible only during inline entry, and serialized
  resize/reset ordering. Independent review verified 24 opted-in focused tests,
  TypeScript, scoped Biome, and whitespace checks; no measured five-second
  latency is claimed.
acceptance_criteria:
  - index: 1
    text: >-
      Full-screen tmux handoff follows the approved AoE sequence without
      duplicate or stale terminal ownership
    checked: true
  - index: 2
    text: >-
      Windowed previews expose one PreviewFrame carrying rendered cells, cursor
      state, and terminal geometry
    checked: true
  - index: 3
    text: >-
      The renderer displays the actual cursor at the frame position and handles
      inline entry resizing and prompt refresh
    checked: true
  - index: 4
    text: Nested tmux-client attachment behavior remains correct
    checked: true
  - index: 5
    text: >-
      Focused backend and UI tests plus a real-terminal verification cover the
      lifecycle
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
---
