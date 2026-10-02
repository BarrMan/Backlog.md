---
task_schema_version: 2
id: BACK-723
title: Replace captured agent previews with native tmux Board and Workspace windows
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-10-01 08:34'
updated_date: '2026-10-01 16:25'
labels:
  - tui
  - terminal
dependencies: []
type: enhancement
ordinal: 357000
description: >-
  Approved migration: repeated fullscreen return failures expose competing
  terminal owners in the captured-preview workspace. Use persistent native tmux
  Board and Workspace windows, a real agent pane, and native zoom. Remove
  superseded implementations and tests without compatibility shims.
implementation_plan: >-
  1. Implement tmux host, pane lifecycle, workspace UI and unified/CLI
  integration in parallel with explicit interfaces. 2. Integrate and verify
  native-window navigation and session continuity. 3. Run independent parallel
  cleanup passes removing superseded implementation and tests. 4. Run focused
  integration tests and static checks, update affected instructions, and
  finalize.


  Address reported regressions in parallel: diagnose and repair BACK-722
  frontmatter using supported CLI workflows; restore full-width Workspace
  search/filter navigation above left task list and right details/live native
  agent pane. Integrate and verify rendered geometry, Board loading, and native
  focus/zoom lifecycle.


  Approved follow-up: shared full-width footer/search in Board and Workspace;
  remove permanent top search field, preserve Status. Native tmux API creates
  full-width header/footer surrounding tasks/details/live agent. Initialize
  terminal dimensions and resize navbar to content on attach/resize. Parallel UI
  and host implementation followed by rendered geometry, search, resize and
  agent continuity verification.


  1. Inspect the workspace topology rebuild and real-tmux test harness. 2. Treat
  a persisted Workspace window ID as absent only after confirming it is not a
  current session window, while preserving real tmux removal failures. 3. Add a
  real tmux regression that removes Workspace, preserves Board, and verifies
  showWorkspace recreates topology. 4. Run focused tests, type-check, Biome, and
  build.
implementation_notes: >-
  Implemented native tmux host with persistent Board and Workspace windows,
  stable agent pane IDs, task mailbox handoff, native pane focus/zoom, scoped
  return keys, and client detach preserving UI and agents. Four implementation
  areas and three independent cleanup areas were delegated. Removed
  captured-preview frames/polling/cursor/input-forwarding/geometry/fullscreen
  handoff paths and superseded tests; retained handoff-specific capture/paste
  operations. Preserved task grouping, details visibility, drafts and editing.
  Real application integration uses isolated tmux servers and actual client
  input, verifies Board task handoff, fullscreen return with same agent PID and
  fresh inline output, inside/outside tmux entry, Board detach and agent stop
  without killing navigation. Host integration covers repeated presentation,
  A-B-A pane swaps and dead display recovery. Configuration save PTY test
  passes. Fixed stale server BACKLOG_CWD inheritance by explicitly supplying
  child project/config environment. Verification: 37 focused tests passed in the
  combined opt-in suite, with its stale-environment test fixture subsequently
  corrected and the remaining integration test passing separately. Both
  compiled-binary PTY tests pass (2/2). bunx tsc --noEmit, bun run check . (810
  files), bun run build and git diff --check -- src pass.


  Fixed reported regressions using parallel agents and fresh bounded
  investigation. Explicit migration repaired unversioned active tasks
  BACK-721/722/723. Board retains cross-branch loading; invalid historical Git
  payloads remain identity-only rather than aborting hydration. Workspace uses
  full-width search/filter region, left tasks-only region, right details above
  live agent; shared state propagates filters and selection. Preserved native
  Enter/Tab/slash in agent input and repaired incomplete host topology while
  parking active agents. Verification: Board/corpus regression suites 16 pass;
  migration tests 5 pass; tmux/controller tests 17 pass; compiled CLI PTY tests
  2 pass; actual compiled Board opens against this repository. TypeScript,
  repository Biome (811 files), build and targeted whitespace checks pass.


  Replaced bootstrap tmux wait-for locking with the shared proper-lockfile owner
  and added a real-tmux stale-lock recovery regression that kills the
  lock-acquisition process before workspace startup.


  Added session-membership validation for the persisted Workspace window ID.
  Missing IDs now trigger topology rebuild without kill-window; an existing
  member still uses strict removal. Added a real-tmux regression that removes
  Workspace, preserves Board, and verifies showWorkspace recreates five panes.
  Verified with bun test --timeout=10000 src/test/tmux-workspace.test.ts, bunx
  tsc --noEmit, bun run check ., and bun run build.
final_summary: >-
  Native tmux Workspace now preserves the requested full-width filters above
  left tasks and right details/live agent layout. Repaired legacy local task
  metadata and historical branch hydration so Board opens without schema errors
  while retaining cross-branch behavior. Verified actual repository Board in a
  PTY, compiled Workspace interactions, focused regression tests, TypeScript,
  Biome and build.
acceptance_criteria:
  - index: 1
    text: >-
      Board and Workspace run independently in persistent tmux windows with
      explicit task selection handoff
    checked: true
  - index: 2
    text: >-
      The same agent pane supports focused inline interaction and native
      fullscreen zoom with Ctrl+Q returning to workspace navigation
    checked: true
  - index: 3
    text: >-
      Agent operations target stable pane identity across task switching,
      handoffs, and reopening
    checked: true
  - index: 4
    text: >-
      Entry inside and outside tmux and workspace cleanup preserve agent
      processes and unrelated tmux resources
    checked: true
  - index: 5
    text: >-
      Captured previews, forwarded interactive input, fullscreen screen handoffs
      and their obsolete tests are removed
    checked: true
  - index: 6
    text: >-
      Focused application tests, real isolated tmux integration tests, type
      checking and formatting checks pass; shipped instructions match behavior
    checked: false
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
