## Agent Workspace Guide

Use this guide only when starting, inspecting, handing off, or configuring an agent Workspace session.

- Open the task-centered TUI with `backlog workspace`.
- Inspect current and prior sessions with `backlog agent-session list BACK-123`; use `preview`, `attach`, or `input` with `--session <id>` for a selected record.
- Start a session with `backlog agent-session start BACK-123`, then use `stop` or `recover` as needed. The list reports the task worktree when configured.
- Request a handoff before replacing work: `backlog agent-session handoff BACK-123`. Complete the exact request with `handoff-complete BACK-123 --request <id> --content <text>` or `--file <path>`; the replacement starts in a detached worker. Use `handoff-continue BACK-123` only to retry a ready handoff.
- Inspect configuration with `backlog agent-config show`. Card takes precedence over project, then root. Initialize `root`, `project`, or `card` before setting it. A configuration is complete at its scope: settings never merge with a parent. `init` is the one explicit copy operation.
- Session commands honor `BACKLOG_CWD` as the project root. Worktree sessions report and run from their task worktree; other sessions run from the project root.

Run `backlog agent-session --help` or `backlog agent-config --help` before an unfamiliar command. Use `backlog instructions task-execution` before changing task state, plans, notes, or implementation work.
