## Backlog.md Overview (CLI)

Backlog.md tracks committed work: what will be built, fixed, or changed.

### When to Use Backlog

Use the CLI when the user requests task operations or this session is explicitly assigned to a Backlog task. Other work does not require task creation or loading these instructions.

Create tasks with `backlog task create` and update them with `backlog task edit <id>`. Consult command help for the fields and options you need.

In a task-bound agent session, read the assigned task first. Keep its description current after meaningful changes to direction, decisions, progress, verification, blockers, or next steps. Preserve requirements and useful context so a fresh session can continue from the task without a separate handover document.

### Find and Read Work

- `backlog search "query" --plain`
- `backlog task list --status "<todo status>" --plain`
- `backlog task list --status "<active status>" --plain`
- `backlog task list --search "login" --labels frontend,bug --limit 20 --plain`
- `backlog task view {{TASK_ID:123}} --plain`

For long lists, use `--max-count` and `--skip`, follow the printed `Next` command, or use `--count` for the total; command help covers the details.

For scripts, `task list`, `task view`, `task <id>`, and `search` accept versioned `--json` output instead of `--plain`. `task list --json --watch` emits complete replacement responses; read successive JSON values, not individual lines. Filters and local scope are unchanged; intermediate edits may be coalesced. Restart for a fresh snapshot.

### Structured Markdown Records

All application-owned structured fields live in versioned YAML frontmatter, not Markdown body sections: tasks and drafts use `task_schema_version: 2`, decisions use `decision_schema_version: 1`, and milestones use `milestone_schema_version: 1`. Bodies are opaque free-form Markdown.

```yaml
---
task_schema_version: 2
id: TASK-1
title: Example task
description: |
  Structured task text belongs in frontmatter.
---

# Scratchpad
- [ ] This is body content.
```

### Optional Guides

Load a guide only when its detail is useful for the requested operation:

- `backlog instructions task-creation` — creating or splitting tasks
- `backlog instructions task-execution` — updating and executing assigned work
- `backlog instructions task-finalization` — verifying and finishing tasks

Use `backlog <command> --help` before unfamiliar operations. Help describes fields, output, and examples.

### Task Lifecycle

Mark finished work Done (or the configured final status). During periodic cleanup, use Complete (`backlog task complete {{TASK_ID:123}}`) to move it off the board while preserving its record and dependency links.

Use Archive (`backlog task archive {{TASK_ID:123}}`) for canceled, duplicate, or invalid work. Archiving removes incoming dependencies and task references.

Use the CLI for Backlog changes. Never edit task, draft, document, decision, or milestone markdown files directly; commands preserve metadata, relationships, and history.
