---
task_schema_version: 2
id: BACK-213
title: Compute sequences from task dependencies
status: Done
assignee:
  - '@codex'
created_date: '2025-07-27'
updated_date: '2025-08-26 16:45'
labels:
  - sequences
  - core
dependencies: []
description: >-
  Introduce core logic to compute sequences (parallelizable groups of tasks)
  solely from existing task dependencies. This will allow the CLI, TUI, and web
  interfaces to show which tasks can be worked on in parallel without adding any
  new task properties.
implementation_plan: >-
  1. Add Sequence type to src/types/index.ts (index, tasks).

  2. Implement computeSequences(tasks) in src/core/sequences.ts using layered
  topological sort (Kahn):
     - Consider only dependencies within the provided task set (ignore external IDs).
     - Stable ordering within a sequence by task ID.
     - If a cycle remains, emit remaining tasks as a final sequence (deterministic order), to surface in downstream UIs.
  3. Add tests in src/test/sequences.test.ts for: no deps, chain, parallel
  branches, complex graphs, external deps ignored.

  4. Keep surface area minimal for reuse by CLI/TUI/web; no UI changes yet.

  5. Run test suite and checks; iterate on feedback.
implementation_notes: >-
  Implemented computeSequences with layered topological sort (Kahn). Added
  Sequence type and tests covering no-deps, chains, parallel branches, complex
  graphs, and external-dep ignore. Stable ordering by task ID; cycles emitted as
  final deterministic layer (surfaced for UIs). All tests pass locally.


  Updated core to return { unsequenced, sequences }; adjusted tests and
  downstream callers (CLI/TUI). Unsequenced definition: no deps, no dependents,
  no ordinal.
acceptance_criteria:
  - index: 1
    text: >-
      Tasks with no dependencies between them are grouped into the same
      sequence.
    checked: true
  - index: 2
    text: >-
      Sequence numbering starts at 1 and increases monotonically; every task
      appears exactly once.
    checked: true
  - index: 3
    text: >-
      Provide an appropriate Sequence type/interface and export it so it can be
      reused by CLI, TUI and web layers.
    checked: true
  - index: 4
    text: >-
      Add unit tests covering scenarios such as: no dependencies, simple chains,
      parallel branches and complex graphs.
    checked: true
  - index: 5
    text: >-
      computeSequences(tasks) returns { unsequenced: Task[], sequences:
      Sequence[] }
    checked: true
  - index: 6
    text: >-
      Unsequenced = tasks with no dependencies, no dependents, and no ordinal;
      excluded from layered sequences
    checked: true
  - index: 7
    text: >-
      Every task appears exactly once across either Unsequenced or one numbered
      sequence
    checked: true
  - index: 8
    text: >-
      Layered sequences computed via topological grouping on remaining tasks;
      stable ordering by task id; cycles emitted as final layer
    checked: true
definition_of_done: []
comments: []
---
