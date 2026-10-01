---
task_schema_version: 2
id: BACK-707.3
title: Add three-pane agent Workspace TUI
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-28 14:05'
updated_date: '2026-09-29 15:35'
labels: []
dependencies: []
parent_task_id: BACK-707
ordinal: 340000
description: >-
  Add task status tree, details editing, live preview/input, full-screen attach,
  hover with per-task draft preservation, details-only history, and scoped
  preset configuration UI.
implementation_plan: >-
  1. Restore complete shared filter setup/pickers and semantics in task viewer
  and Workspace. 2. Centralize task/group selection transitions, invalidating
  stale async session content and preserving outgoing drafts/scroll. 3. Keep
  mode shortcut help independent from transient notifications and reuse
  inverse/bold list selection styling. 4. Verify focused regressions, actual
  terminal interactions, TypeScript and Biome; record evidence and remaining
  limits.


  5. Add user-requested Shift+B round-trip Board/Workspace navigation through
  existing view lifecycle, respecting text/agent input ownership; show concise
  shortcut hints. In parallel correct group Tab semantics so session actions
  require an actual selected task. 6. Verify focused keyboard regressions, real
  terminal round-trip, TypeScript and Biome.


  7. Correct Shift+B lifecycle: unified controller owns one persistent terminal
  screen; Board/Workspace dispose only view resources on switching, preserving
  drafts and terminal alternate screen. Implement renderer cleanup in parallel,
  then verify raw terminal output contains no alternate-screen leave/re-entry
  during repeated toggles and clean exit still works.


  8. Restore Workspace N to shared task creation; Enter on a task starts missing
  session then attaches fullscreen or attaches current session. Preserve group
  Enter expansion and Tab inline input; update shortcut guidance and verify
  widget-dispatched lifecycle regression.


  9. Correct fullscreen session terminal ownership using leave-before-pause and
  unconditional resume, full re-entry/redraw, and suppress Workspace activity
  while external session owns terminal. Verify alternate buffer and mouse state
  before/after real tmux attach/detach, repeated cycles, input, and focused
  regressions.


  10. Reassess session ownership: keep durable state in SessionStore, replace
  service forwarding wrappers with direct store use, and isolate launch and
  handoff transitions through existing process/worktree ports. Simplify
  Workspace lifecycle state and unsafe widget access without changing
  serialization or terminal key ownership. 11. Run focused unit/type/lint
  checks; separately attempt the real-provider terminal acceptance within the
  requested time bounds.
implementation_notes: >-
  Updated workspace selection/polling, pointer and keyboard navigation, in-panel
  field editing, serialized inline input, scoped configuration controls, and
  attach resize suppression. Type-check, Biome, and the existing opt-in PTY
  launch test pass. Expanded PTY interaction coverage remains incomplete because
  the expect harness did not terminate reliably under continuous redraws.


  Replaced the expect launch smoke coverage with an opt-in tmux interaction
  harness covering task-field save, details-only history, filter/header
  navigation, and card worktree persistence. In this checkout it is skipped
  because Bun resolves tmux to a non-spawnable dev3 shim; focused
  configuration/model tests pass (12 tests, 35 assertions).


  Replaced the PTY save flow with an isolated project built-in preset carrying
  workspace-save-ready-command. Both permitted interactive runs rendered that
  async sentinel but did not emit Saved card preset after Ctrl+S; the test
  watchdog killed each at 25 seconds. No production change made.


  Fixed src/test/agent-workspace-pty.test.ts: every Tcl expect invocation now
  uses multiline pattern/action branches, including EOF. The opt-in PTY test
  passed on its first attempt (real Ctrl+S save and persisted card configuration
  reload); scoped Biome and full TypeScript checks pass. No product change was
  needed: single-line Tcl expect branches silently skipped their actions.


  Fixed workspace keyboard ownership: details and history keypresses no longer
  reach screen navigation. Added an in-process regression harness that
  dispatches to both the focused widget and screen; its behavioral assertions
  verify details Down selects Description once and retains BACK-1, and history
  Up selects the prior session while retaining BACK-1. Existing opt-in
  configuration PTY test passed; TypeScript and Biome pass.


  Attempted bounded shared-header integration coverage and added header/popup
  ownership before inline input. Two focused test runs were used. Remaining test
  failures: the converted prior navigation test waits only for widget creation
  and observes Tasks.selected = 0 before initial reload completes (must wait for
  selected task state); the new test treats blessed list items as strings, but
  entries are objects, so item.includes throws. No further fix/test attempt was
  made per the requested two-attempt limit. TypeScript, Biome, and PTY checks
  were not run after these failures.


  Updated workspace slash recognition to use the keypress character or terminal
  sequence and prevented global q from closing during a filter popup. TypeScript
  and source-only Biome pass. The focused navigation test remains blocked by its
  existing initial-reload race (Tasks.selected is 0; search filter times out).
  Both bounded PTY attempts failed before workspace launch due init argument
  validation, so no terminal key payload was emitted or captured; stopped after
  the requested two attempts.


  Diagnosed the remaining search failure: committed search is "matching" and the
  workspace rebuilt headers as To Do (1), In Progress (0), Done (0), but
  tree.items still has 5 rows including TASK-2 Done task. This proves
  filteredTasks/reload completed; the stale rendered row is widget state. A
  bounded clearItems()+setItems attempt neither removed the row nor type-checks
  because clearItems is unknown on the inferred list surface, so it was removed.
  The navigation test now reports search value, item count, and contents on
  timeout. Two permitted test attempts were used; focused navigation remains
  failing. TypeScript was run only with the attempted call and failed at that
  line; scoped Biome also reports existing formatting changes in the navigation
  test.


  Fixed stale workspace list rows by removing surplus widget items with
  removeItem before setItems. The focused navigation/filter test (2 tests, 13
  assertions), opt-in configuration PTY test (1 test, 3 assertions), TypeScript,
  and Biome checks pass.


  Confirmed at runtime that tree.remove is the numeric-only list override and
  screen.remove is the inherited node detacher. Updated reload to call
  screen.remove with tree as receiver before removeItem, and added an in-process
  regression that asserts the obsolete row leaves both items and children.
  Navigation test passed (2 tests, 16 assertions); TypeScript and Biome passed.
  Existing opt-in expect PTY test passed. The first real-tmux visual attempt
  using /opt/homebrew/bin/tmux exited before capture-pane (can't find pane), so
  the required visual assertion could not run; stopped under the two-attempt
  limit.


  Restored shared FilterHeader (Search + Status), shared task-search semantics,
  canonical task row/detail rendering and status/focus colors. Corrected slash
  input recognition and filter/popup ownership over inline input. Runtime
  inspection identified neo-neo-bblessed numeric-only List.remove breaking both
  internal row removal and child detachment; Workspace now removes both
  correctly. Independent checks: 39 tests / 112 assertions across
  navigation/model/shared-header/search-parity/boundary suites pass; real
  config-save PTY passes; tsc and repository Biome pass. Actual tmux captures
  confirm ANSI colors and no header/pane overlap at 120x40 and 70x24; query
  needle leaves only matching task and clearing restores all rows. Narrow footer
  and long task rows still clip. Full hover/draft/inline acceptance and
  real-provider handoff remain outside this verification; task stays In
  Progress.


  Fixed four reported Workspace regressions: separate expiring status row with
  persistent mode-aware shortcuts; complete shared header control/picker/filter
  mapping with task viewer (Search, Status, Type, configured Project, Priority,
  Milestone, Labels); canonical inverse/bold task highlight; centralized
  task/group transitions invalidate delayed session responses and clear stale
  right panes/actions. Simplified shared filtering to canonical applyTaskFilters
  plus shared option mapping; preserved viewer label-match and excluded
  statuses. Verified 44 tests/141 assertions across seven targeted suites,
  opt-in config-save PTY 1 pass/3 assertions, TypeScript pass, repository Biome
  completed with one warning subsequently corrected and scoped Biome clean. Real
  tmux at120x40 confirms full controls, working Priority/Labels pickers, ANSI
  inverse/bold without blue, task-to-task detail updates and group clearing
  surviving polling. At70x24 full header, shortcuts including q Close, visible
  no-session notification expiry at3.2s and restored bottom border verified.
  Picker interaction exercised by keyboard; mouse picker activation not
  separately audited. Broader parent feature remains In Progress pending
  previous real-provider/complete hover acceptance work.


  Added requested Shift+B Board/Workspace round-trip through unified view, with
  footer/help hint and retained Workspace draft/filter/collapse/selection/scroll
  state. Text fields and inline agent input retain keyboard ownership. Tab on a
  status group is now silent; no-session task retains start-session
  notification. Centralized unified watcher teardown so normal exits clean up
  after switching. Verification: 12 navigation/switching/footer tests with53
  assertions; 37 CLI/unified/view-switcher tests with98 assertions; config-save
  opt-in PTY passes; TypeScript and repository Biome clean. Actual terminals
  prove board-start roundtrip, workspace-start two roundtrips, group Tab silence
  vs task warning, Search uppercase B ownership, and70col toggle hint. Final
  independent expect EOF and tmux exec-Bun checks with explicit fixture
  BACKLOG_CWD prove q exits within1s after both routes. Broader Workspace
  acceptance remains In Progress.


  Corrected Shift+B teardown: unified owns one persistent Board/Workspace
  screen. Both renderers dispose their own widgets/listeners/timers while
  retaining that screen; Workspace guards stale async callbacks and retains view
  state. Board direct footer explicitly disposed. Task-list Tab uses its
  existing independent lifecycle with shared screen released before handoff.
  Direct verification after cancelled stalled audit:20 focused tests/64
  assertions pass; TypeScript and full Biome pass; opt-in config-save PTY
  passes. Actual expect-driven CLI workspace->board->workspace->board->workspace
  completed with ZERO alternate-screen enter/leave sequences during all four
  switches; q reached EOF cleanly. Main requested shell-exposure regression
  objectively verified from raw terminal output.


  Restored Workspace N to shared task composer including group and
  empty-workspace selection. Enter on task starts missing session then attaches
  fullscreen or attaches existing session; concurrent Enter actions serialized.
  Composer owns input/polling; Enter group expansion and Tab inline semantics
  preserved. Footer/no-session guidance updated. Verification:15 tests/68
  assertions across navigation, switching, footer suites; TypeScript and
  repository Biome pass. Widget regression checks persisted task creation, modal
  ownership and start-once/attach-existing using controlled service. Real70x24
  terminal N opens Create Task; Escape cancel then q exits. Real-provider
  fullscreen launch not exercised in this pass.


  Fixed fullscreen return lifecycle: leave before pause, unconditional resume,
  enter with full cache allocation/redraw and mouse restoration. Suspend
  Workspace render/poll/input while external terminal owns TTY; restore preview
  resizing afterward. Verified23 tests/73 assertions across
  navigation/switching/board lifecycle, TypeScript and repository Biome pass.
  Direct native tmux audit with controlled service and REAL child tmux attach
  completed two Enter/Ctrl+B D cycles: inner client confirmed attached,
  Workspace alternate_on=1 mouse_any_flag=1 before and after, full
  header/details/preview/footer redrawn. Arrow input and wheel reports followed
  by q worked; clean exit sentinel and alternate_on=0 mouse_any_flag=0. No
  Workspace layout in normal history. Earlier full-CLI fixture audits failed due
  environment/stale short-lived fixture sessions; successful audit isolates TTY
  handoff rather than provider startup.


  User reports terminal issues remain unresolved; task remains In Progress.


  Reassessed requested workspace paths only. SessionStore now rejects malformed
  nested durable session/handoff payloads while retaining state.json v1, atomic
  writes, lock timing, and recovery semantics. AgentSessionService calls
  SessionStore directly, removing private forwarding wrappers; launch remains
  orchestrated through the existing SessionProcess and worktree ports. Workspace
  uses named Blessed capability adapters for layout, scroll, editable inputs,
  and selection, preserving N, Tab, Ctrl+Q, raw inline input, and serialized
  input queue behavior. Verified focused SessionStore/model/navigation tests: 11
  pass, 47 assertions; scoped Biome clean; opt-in PTY configuration test: 1
  pass, 3 assertions. Full tsc remains blocked by unrelated existing
  CLI/MCP/server errors; filtered workspace paths emit no TypeScript errors.
  opencode 1.18.33 is installed, but the PTY test uses a synthetic command, so
  no real-provider launch/attach/handoff acceptance is claimed and the task
  remains In Progress.
acceptance_criteria:
  - index: 1
    text: >-
      Task filtering and focus/input preservation with hover work, Space edits,
      Enter attaches, Tab interacts, and S opens history only in details
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
