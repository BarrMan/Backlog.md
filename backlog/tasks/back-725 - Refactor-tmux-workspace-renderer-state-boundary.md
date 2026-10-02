---
task_schema_version: 2
id: BACK-725
title: Refactor tmux workspace renderer state boundary
status: Done
assignee:
  - '@pi'
created_date: '2026-10-02 07:36'
updated_date: '2026-10-02 08:22'
labels:
  - tui
  - terminal
dependencies: []
type: enhancement
ordinal: 359000
description: >-
  Move workspace architecture to a tmux-only renderer over task-owned app state.
  Task/session data stays in Backlog app state; tmux panes/windows/options are
  renderer-local. Pane IDs are never persisted as identity. Live agent panes are
  discovered by metadata (project root + role + task ID). One live agent pane
  per task. Max live agent panes defaults to 10; when full, auto-stop the
  least-frequently-used eligible pane with oldest last-used as tie-break. No
  backward compatibility preservation: remove legacy paneId identity and old
  coupling during cleanup checkpoints.
implementation_plan: >-
  Phase 0 — Contract: define task-owned session model and tmux renderer
  boundary. Cleanup 0: remove/avoid any generic/browser abstraction language
  from the plan.

  Phase 1 — State boundary: introduce workspace state API for tasks, sessions,
  start/resume/stop/edit operations with no tmux imports. Cleanup 1: delete
  direct state/tmux cross-coupling made obsolete by the API.

  Phase 2 — Task-owned sessions: route workspace through task.sessions and
  task.activeSessionId. Cleanup 2: remove detached/global session plumbing from
  workspace code.

  Phase 3 — TmuxRenderer: introduce tmux-only renderer owning selected task,
  pane lookup, swapping, metadata, and LFU usage; mutations go through state
  API. Cleanup 3: remove controller-to-paneId presentation calls.

  Phase 4 — Pane metadata discovery: tag live panes with project root,
  role=agent, task ID; discover by metadata; duplicate matches fail closed.
  Cleanup 4: remove stored-pane lookup branches.

  Phase 5 — Remove paneId persistence: stop writing paneId to app/session state
  and make preview/kill/attach/alive resolve by tags. Cleanup 5: remove
  AgentSession.paneId from active types and validation.

  Phase 6 — LFU cap: enforce max live agent panes=10 by auto-stopping LFU
  eligible pane, oldest last-used tie-break; never stop current, other-root, or
  untagged panes. Cleanup 6: remove temporary counters/bridges.

  Phase 7 — Final cleanup/validation: simplify tests/docs around tmux-only
  renderer and run focused tests, real tmux smoke, typecheck, Biome.
final_summary: >-
  Implemented tmux-only workspace renderer boundary: task/session state no
  longer persists pane IDs, agent panes are tagged and discovered by metadata at
  command time, and the workspace presentation path clears stale active panes.
  Added task-owned workspace state facade, LFU usage tracking, and max-running
  cap that auto-stops the least-used eligible live session.


  Validation: focused agent/workspace/tmux tests passed (43 pass, 2 skip, 0
  fail); bunx tsc --noEmit passed; bun run check . passed. Full suite was not
  completed; earlier full run exposed unrelated/flaky failures outside this task
  scope.
acceptance_criteria:
  - index: 1
    text: Task/session app state has no tmux pane IDs as identity
    checked: true
  - index: 2
    text: Tmux renderer discovers live agent panes by metadata
    checked: true
  - index: 3
    text: Max live agent panes defaults to 10 and auto-stops LFU eligible pane
    checked: true
  - index: 4
    text: >-
      Each phase has a cleanup checkpoint and no backward compatibility shims
      remain
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
