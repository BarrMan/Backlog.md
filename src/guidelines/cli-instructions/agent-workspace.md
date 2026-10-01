## Agent Workspace Guide

Use this guide only when starting, inspecting, handing off, or configuring an agent Workspace session.

- Open the native tmux Workspace with `backlog workspace`. It keeps persistent Board and Workspace windows and agent panes. Top filters remain separate from the full-width shared bottom footer: press `/` to activate its live search. `Enter` commits the query (an empty query clears it) and returns task focus; `Esc` restores the query from before editing and returns task focus. When an agent pane is focused, its native input is unaffected. Press `Tab` to focus the selected agent, `Ctrl+Q` to return to Workspace navigation, and `q` to detach without stopping the workspace or agents.
- Inspect current and prior sessions with `backlog agent-session list BACK-123`; use `output` to read persisted output or `attach` with `--session <id>` for a selected record. Interactive input belongs in the native agent pane, not an agent-session command.
- Start a session with `backlog agent-session start BACK-123`, then use `stop` or `recover` as needed. The list reports the task worktree when configured.
- Task-bound agents keep the task description current so every new session can continue from it. Before switching, save outstanding context to the description with `backlog task edit`. No separate handover document is needed.
- Replace the active session with `backlog agent-session handoff BACK-123` (or `h` in the Workspace task list). A detached worker starts a new session for the same task, makes it active, and stops the previous session. Failed startup leaves the previous session active. Use `handoff-continue BACK-123` to retry a failed replacement.
- Press `Space` on a Workspace task to focus Details, then `s` to select a session. Use arrows and `Enter` to open a running session or read a stopped session's saved output; `Esc` returns to the picker. Stopped sessions remain in the picker.
- Inspect configuration with `backlog agent-config show`. Card takes precedence over project, then root. Initialize `root`, `project`, or `card` before setting it. A configuration is complete at its scope: settings never merge with a parent. `init` is the one explicit copy operation.
- Session commands honor `BACKLOG_CWD` as the project root. Worktree sessions report and run from their task worktree; other sessions run from the project root.

Consult `backlog agent-session --help` or `backlog agent-config --help` as needed.
