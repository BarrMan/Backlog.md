---
task_schema_version: 2
id: BACK-595
title: Ship Backlog.md as an Agent Plugin with skill-based instructions
status: To Do
assignee: []
created_date: '2026-08-07 21:26'
labels:
  - agents
dependencies: []
references:
  - 'https://agent-plugins.org'
  - 'https://agentskills.io'
priority: medium
type: enhancement
ordinal: 235000
description: >-
  The Agent Plugins spec 1.0.0 (agent-plugins.org, published 2026-08-06) defines
  a portable plugin format that conformant clients install directly. TSC
  members: AWS, Cursor, Microsoft, OpenAI, Vercel. Conformant clients today: VS
  Code, Cursor, GitHub Copilot, ChatGPT/Codex, Kiro. Claude Code and Gemini CLI
  are NOT conformant. A plugin is `plugin.json` plus two portable component
  types: skills (`skills/<name>/SKILL.md`, per agentskills.io) and an optional
  `mcp.json`.


  Maintainer direction, recorded explicitly: instead of relying on MCP resources
  for guidance, the plugin must carry Backlog's agent nudge AND the agent
  instructions as SKILLS inside the plugin folder.


  Known constraint to resolve during planning: the instruction guides in
  `src/guidelines` contain runtime templating (`{{TASK_ID}}`, resolved from the
  project's configured ID prefix by `renderConfiguredTaskIds`), which a static
  `SKILL.md` cannot evaluate. The planner must choose how to reconcile this -
  for example genericize the examples in the skill copies, generate the plugin
  from `src/guidelines` at build time, or keep project-specific bits behind a
  `backlog instructions` call - and record the decision in the task.


  Distribution: a git repository installable by URL. NO marketplace submissions;
  the OpenAI directory review process is an explicit non-goal.


  Relationships (reference only - do not modify either task):

  - BACK-349 (Publish Backlog.md as an Agent Skill with bundled guidance): this
  task supersedes its scope, and BACK-349's "instruct agents to use MCP tools"
  acceptance criterion is stale.

  - BACK-411 (Prototype a Codex plugin for Backlog binary and MCP, In Progress):
  overlaps, because Codex now consumes this very spec.
acceptance_criteria:
  - index: 1
    text: >-
      A plugin directory exists with a valid plugin.json and passes the Agent
      Plugins 1.0.0 validation rules
    checked: false
  - index: 2
    text: >-
      The plugin ships skills that carry both the Backlog agent nudge and the
      agent instruction guides (creation, execution, finalization) as SKILL.md
      components, not as MCP resources
    checked: false
  - index: 3
    text: >-
      Guidance content in the plugin cannot drift from src/guidelines: it is
      generated or single-sourced, and the repo states which mechanism is used
    checked: false
  - index: 4
    text: >-
      The decision for handling runtime-templated examples is recorded in the
      task, and no unresolved template placeholders appear in any shipped skill
      file
    checked: false
  - index: 5
    text: >-
      The plugin installs from its git repository URL and is verified working in
      at least two conformant clients
    checked: false
  - index: 6
    text: README documents installation from the git repository URL
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
