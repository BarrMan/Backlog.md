---
task_schema_version: 2
id: BACK-555
title: Add a context-independent handoff check to task creation guidance
status: To Do
assignee: []
created_date: '2026-07-27 21:20'
labels: []
dependencies: []
documentation:
  - MANIFESTO.md
  - src/guidelines/cli-instructions/task-creation.md
  - src/guidelines/mcp/task-creation.md
priority: medium
type: enhancement
ordinal: 200000
description: >-
  Backlog.md already tells agents to write tasks for future workers who have no
  memory of the originating conversation, but that principle is easy to satisfy
  superficially. Tasks can still depend on unexplained project terms, libraries,
  relative references such as “the existing parser,” or dependency IDs that do
  not name the artifact being consumed.


  Make context independence an explicit, operational check in the task-creation
  workflow. Before reporting a task as created, the creator should read the
  saved task as a stranger, correct missing context, and confirm the handoff
  check in the response to the user. Project-specific tools and decisions must
  be defined or linked; for example, “use Comark” is insufficient unless the
  task explains what Comark is, why it is required, and where its authoritative
  documentation lives.


  This work changes task-creation guidance and its user-facing creation report.
  It must not add automated semantic scoring, block task creation, or require
  speculative implementation research at creation time.
acceptance_criteria:
  - index: 1
    text: >-
      The canonical CLI task-creation guide contains a concrete
      context-independent checklist covering the product or subsystem, desired
      outcome and why it matters, required inputs and named dependency outputs,
      expected deliverable, project-specific terms and tools, fixed constraints
      and authoritative references, scope boundaries, and independently testable
      acceptance criteria.
    checked: false
  - index: 2
    text: >-
      The guide warns against unanchored references such as “same,” “existing,”
      “above,” “first,” “current,” and “supported,” and shows how to replace
      them with explicit identifiers, paths, artifacts, or definitions.
    checked: false
  - index: 3
    text: >-
      The guide states that an unfamiliar library or internal term must be
      defined by purpose and capability and linked when authoritative
      documentation is needed; it includes a concrete bad/good example such as
      the difference between “parse with Comark” and a self-contained Comark
      requirement.
    checked: false
  - index: 4
    text: >-
      After creating a task, the workflow requires the creator to run `backlog
      task view <task-id> --plain`, cold-read the saved task without relying on
      conversation memory, and correct it before handoff when context is
      missing.
    checked: false
  - index: 5
    text: >-
      The creation report shown to the user includes a concise handoff
      confirmation that the task was reviewed for readers unfamiliar with the
      conversation, including defined or linked terms, named dependency outputs,
      explicit scope, and independently testable acceptance criteria.
    checked: false
  - index: 6
    text: >-
      Every shipped task-creation instruction surface carries equivalent
      guidance, with the CLI instructions remaining canonical and the legacy MCP
      guide kept consistent.
    checked: false
  - index: 7
    text: >-
      Automated coverage detects removal or material drift of the
      context-independent checklist and post-creation handoff requirement from
      the shipped instruction surfaces.
    checked: false
  - index: 8
    text: >-
      Task creation remains non-blocking: no semantic scoring, task-content
      validator, or new required task metadata is introduced.
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
