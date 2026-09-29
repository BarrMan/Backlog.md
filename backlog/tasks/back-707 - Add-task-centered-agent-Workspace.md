---
id: BACK-707
title: Add task-centered agent Workspace
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-28 14:05'
updated_date: '2026-09-28 16:12'
labels: []
dependencies: []
type: feature
ordinal: 337000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Approved product scope: integrate AOE-style persistent tmux agent sessions with Backlog tasks. Three-pane TUI: status-filtered task tree, task details, live session. Hover changes preview without losing edits/input. Space opens details; session history only there. Root/project/card presets are complete overrides initialized from effective parent; command, environment, optional preparation and per-task worktree. Every new conversation receives minimal capability-index instructions then reads its task and optional single referenced handoff document. Handoff deletes prior document, asks outgoing agent to recreate it, waits for explicit completion, retires old session, and launches replacement in the same task worktree. First successful session marks task in progress. Built-ins: OpenCode, Claude, Codex, Gemini, AntiGravity; custom presets supported.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workspace supports task filtering, hover preview, retained edits, full-screen and inline session input, and details-only session history
- [ ] #2 Scoped configuration uses nearest complete override and copies effective parent when initialized; presets and per-task worktrees configurable
- [ ] #3 Persistent sessions survive UI exit, expose CLI lifecycle/history, and first successful creation moves task in progress
- [ ] #4 One referenced handoff document is regenerated with explicit completion before automatic replacement; failures and restarts are recoverable
- [ ] #5 Minimal startup instructions identify task/session/worktree and link to on-demand capability guides
- [ ] #6 Targeted tests and real terminal checks cover lifecycle, focus, configuration, handoff, and regression behavior
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement configuration, session runtime, Workspace UI, and CLI/instructions as parallel independent modules with agreed contracts. 2. Integrate and review each module. 3. Exercise lifecycle and terminal interactions, run targeted tests/type/lint checks, fix findings. 4. Finalize verified acceptance criteria.

Stabilize via delegated implementation only: follow AOE and existing Backlog test patterns; simplify brittle Workspace PTY coverage; fix scoped-config UI and session restart/handoff issues; independently review diffs and run targeted checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delegated stabilization independently verified: focused suites 27 pass / 1 optional skip; actual configuration-save PTY 1 pass with persisted card equality; optional real-tmux session suite 6 pass; navigation ownership regression 1 pass / 7 assertions. TypeScript and repository Biome checks pass. Coordinator identified malformed single-line Tcl expect branches and rejected incomplete key-routing fix; subagents corrected both. Scope remains In Progress: actual provider composer behavior and full hover/inline interaction acceptance are not proven by these checks.
<!-- SECTION:NOTES:END -->
