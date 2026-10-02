---
task_schema_version: 2
id: BACK-724
title: Preserve workspace task-list focus during agent preview swaps and return
status: Done
assignee:
  - '@worker'
created_date: '2026-10-01 17:53'
updated_date: '2026-10-01 18:21'
labels: []
dependencies: []
references:
  - src/agent-workspace/tmux-workspace.ts
  - src/ui/workspace/controller.ts
  - src/test/tmux-workspace-integration.test.ts
priority: high
type: bug
ordinal: 358000
description: >-
  ## Outcome

  Keep keyboard focus in the task list while browsing tasks and updating native
  agent previews. Only explicit agent-focus actions should move input into the
  agent. Ctrl+Q must return to the task list, and quitting must detach the UI
  without stopping the agent.


  ## Report and evidence

  Observed in /Users/imribarr/Projects/gemini, task SIN-001: fullscreen
  initially showed a blank screen; returning left navigation and quit keys
  unresponsive; Tab could enter the live agent. After temporarily correcting
  Ctrl+Q, one arrow key worked, then focus jumped into the preview and
  subsequent keys went there.


  Confirmed root cause: src/agent-workspace/tmux-workspace.ts uses tmux
  swap-pane without -d in showAgent, its retry, returnAgent, and rebuild
  restoration. Selection changes call showAgent to show/hide previews. A
  separate real tmux server reproduced this with task pane %0, placeholder %1,
  and agent %2: ordinary show swap selected %2; ordinary hide swap selected %1;
  adding -d preserved %0 for both. Preview updates must not select their
  destination pane.


  Second confirmed defect: Ctrl+Q targets navPane (filter header), not
  tasksPane. The live filter pane had exited with SIGINT; the shortcut
  repeatedly selected this dead pane. Before it died, its Tab handler could
  still enter the agent. Navigation-region q/C-c closes that UI region rather
  than detaching the workspace; review this related exit path.


  The initial blank fullscreen sequence has NOT been independently reproduced.
  Focus moving into the blank placeholder is verified, but do not assume it
  explains every fullscreen symptom.


  ## Suggested approach

  Use detached swaps consistently, including retry and rebuild paths; retain
  deliberate focus changes in explicit agent-focus actions. Bind Ctrl+Q to the
  current task-list pane and unzoom on return. Make filter/task return-and-quit
  behavior reliable. Add failing focus regressions before implementation.


  Use an isolated tmux socket with fake agents. Assert actual pane focus, not
  only successful mocked commands. Cover repeated selection of tasks/groups,
  preview show/hide/replacement, explicit Tab inline input, Enter fullscreen,
  Ctrl+Q return, rebuild, and detach with agent survival.


  Relevant tests: src/test/tmux-workspace.test.ts,
  src/test/tmux-workspace-integration.test.ts,
  src/test/workspace-controller.test.ts,
  src/test/workspace-session-selection.test.ts. Run relevant tests with bun test
  --timeout=10000, plus bunx tsc --noEmit and Biome checks.


  ## Handoff and safety

  No source fix was implemented. Investigation branch:
  tasks/back-723-native-tmux-windows. Pre-existing edits to AGENTS.md, BACK-723
  task metadata, and untracked .serena/ were left untouched.

  A temporary session-local Ctrl+Q binding targeted the live task-list pane;
  this did not fix swap-induced focus theft. Reinspect current resource IDs
  instead of reusing recorded IDs.

  Affected UI processes ran /Users/imribarr/Projects/Backlog.md/dist/backlog.
  Starting bun run cli workspace does not replace already-live UI processes:
  verify the executing build and refresh only UI panes deliberately after the
  fix. Preserve the running agent, session state/history, tasks, worktrees, and
  uncommitted code. Never test keystrokes against the live agent or kill the
  user tmux server.

  An earlier missing-paneId legacy-state failure was separately cleaned up with
  a backup and is out of scope; another reset will not fix this issue.
implementation_notes: >-
  Implementation notes:

  - Used detached tmux swaps (`swap-pane -d`) for preview show, retry, return,
  and rebuild restoration so pane selection stays on the task list unless
  `focusAgent` explicitly runs.

  - Rebound Ctrl+Q to the live Workspace task-list pane and rebind it after
  topology rebuilds; the binding unzooms before selecting tasks.

  - Detach now recognizes all owned UI panes, including footer, and
  navigation-region q/C-c asks the host to detach instead of destroying only
  that region.

  - Preserved explicit Tab/Enter agent focus and repaired the workspace details
  toggle so Space hides/shows details while Right/L still focuses details.

  - Initial blank fullscreen sequence was not separately reproduced in isolated
  tmux runs; scoped real-tmux coverage now exercises fullscreen/return and
  confirms return focus to the task pane with the agent surviving.


  Verification:

  - bun test --timeout=10000 src/test/tmux-workspace.test.ts
  src/test/agent-workspace-navigation.test.ts

  - bun test --timeout=10000 src/test/tmux-workspace.test.ts
  src/test/tmux-workspace-integration.test.ts

  - bunx tsc --noEmit

  - bun run check .

  - bun run build
final_summary: >-
  Preserved Workspace task-list focus during native agent preview swaps and
  return. Preview swaps now use detached tmux swaps, Ctrl+Q targets the
  rebuilt/live task pane, q/C-c in the navigation region detaches the workspace,
  and tests cover actual real-tmux focus and agent survival.
acceptance_criteria:
  - index: 1
    text: >-
      Repeated task/group navigation and preview show/hide/replacement preserve
      task-list focus, including swap retry and rebuild paths; navigation keys
      never reach an agent unintentionally.
    checked: true
  - index: 2
    text: >-
      Explicit Tab and Enter agent-focus behavior still works; Ctrl+Q unzooms
      and returns to the current live task-list pane, including after a
      workspace rebuild.
    checked: true
  - index: 3
    text: >-
      The return-and-quit workflow detaches the workspace without stopping its
      agent; q/C-c in the filter region does not merely destroy that region and
      leave focus on a dead pane.
    checked: true
  - index: 4
    text: >-
      Isolated real-tmux regressions verify actual focus and agent survival
      through repeated navigation, fullscreen/return, and detach without
      interacting with user-owned sessions.
    checked: true
  - index: 5
    text: >-
      Investigate the initial blank fullscreen sequence and either fix it or
      document a separate reproducible finding; do not infer its resolution from
      the swap fix alone.
    checked: true
  - index: 6
    text: >-
      Relevant workspace tests, typecheck, and Biome checks pass; runtime
      verification uses the fixed UI build rather than stale existing processes.
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
