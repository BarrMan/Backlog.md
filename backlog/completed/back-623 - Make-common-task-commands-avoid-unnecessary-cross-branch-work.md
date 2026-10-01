---
task_schema_version: 2
id: BACK-623
title: Make common task commands avoid unnecessary cross-branch work
status: Done
assignee:
  - '@codex'
created_date: '2026-08-09 22:02'
updated_date: '2026-08-10 06:56'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 261000
description: >-
  Common single-task commands currently load the cross-branch corpus and may
  fetch origin before resolving a local task. On this repository that makes task
  view and task edit take tens of seconds or hang. Task list is also slower than
  expected. Preserve fail-closed identity semantics while making local
  single-task operations bypass cross-branch work and removing avoidable work
  from task listing.
implementation_plan: >-
  1. Add working-copy active/completed identity resolution that preserves
  canonical ambiguity without branch loading.

  2. Make includeCrossBranch:false load and search local tasks directly, and
  route CLI view, shorthand, and edit through that path.

  3. Preserve the atomic in-lock reread but make it local, and remove the
  redundant interactive-list corpus load.

  4. Add regression tests proving fetch and branch readers are not called while
  existing cross-branch Core behavior remains.

  5. Run focused tests, typecheck, lint, build, and before/after command
  timings.
implementation_notes: >-
  Diagnosis: v1.49.0 routed local view/edit through the cross-branch
  ContentStore; v1.50.0 added a necessary in-lock reread that currently repeats
  that full scan. includeCrossBranch:false has only filtered results after
  loading. Backlog lock directories were empty and task locks fail fast;
  unbounded fetch plus repeated branch indexing is the dominant delay.


  Implemented a working-copy active/completed identity resolver for local reads
  and mutations; includeCrossBranch:false now loads and searches local tasks
  before ContentStore initialization. CLI view, shorthand, edit, and parent
  filtering use the local scope; the atomic in-lock reread remains. Removed the
  interactive list's redundant full load. Consolidated padded/dotted task search
  variants into one shared helper so local and global search remain aligned.


  Validation passed: TypeScript, Biome over 371 files, build, and 178
  focused/control tests covering local Git tripwires, CLI branch-only behavior,
  list/search, custom IDs, task views, Core identity behavior, atomic locks,
  board/worktree refresh, and cross-branch ContentStore preservation. A broad
  ContentStore batch also exposed unrelated temporary-worktree watcher timeouts;
  the relevant cross-branch invariant passed alone.


  Same-checkout benchmark, v1.50 to fixed binary: task view 4.42s to 0.85s; task
  list 4.15s to 0.21s; no-op task edit 12.19s to 0.42s. The old commands
  attempted remote fetches; the fixed commands did not.


  Review fix round: reconciled parent-ID resolution so task create --parent uses
  the same local active/completed fail-closed resolution as task list --parent
  and task view, and moved dependency validation onto the same working-copy
  lookup so it no longer runs a cross-branch load and remote fetch inside the
  task lock; a parent or dependency that exists only on another branch is now
  refused on every surface. Local not-found messages (view, shorthand, edit,
  --parent on list and create, missing dependencies) now name the working copy
  as the corpus searched and point at the browser view, using a fixed sentence
  with no branch scanning. Restored the browser default: /api/tasks serves the
  cross-branch ContentStore again instead of re-globbing the working copy per
  request, with crossBranch=false still serving the local view. Removed the
  unused TaskReadOptions parameters from archiveTask, completeTask, demoteTask,
  and editTaskOrDraft; archive/complete/demote keep their existing cross-branch
  reads. New pins cover create-parent and dependency locality under the fetch
  tripwire, fail-closed ambiguity for both, the hint wording across CLI
  surfaces, and the store-served /api/tasks default; the two tests that pinned
  cross-branch parent and dependency acceptance were inverted. Gates: tsc, biome
  (371 files), build, and the full suite at 2201 pass / 6 skip / 0 fail.


  Reconciliation went both ways: task list --parent now resolves through the
  same working-copy lookup as task view and task create --parent, so a completed
  parent is no longer missing for the filter alone, the filter reads the corpus
  once instead of twice, and the ambiguity message still names the configured
  prefix. Full suite after that change: 2203 pass / 6 skip / 0 fail.
final_summary: >-
  Made local task list, view, shorthand, and edit bypass cross-branch fetching
  and branch enumeration while preserving local ambiguity checks and atomic edit
  locking. Global cross-branch Core behavior remains available for browser/MCP
  surfaces. Verified with structural Git-boundary tests, CLI branch-only tests,
  178 focused/control tests, typecheck, lint, build, and same-checkout timings.
acceptance_criteria:
  - index: 1
    text: >-
      backlog task view and the task shorthand resolve and render a unique local
      task without fetching remotes or enumerating active branches
    checked: true
  - index: 2
    text: >-
      backlog task edit resolves and updates a unique local task without
      fetching remotes or enumerating active branches
    checked: true
  - index: 3
    text: >-
      Single-task commands still fail closed for ambiguous local task identities
      and report missing tasks correctly
    checked: true
  - index: 4
    text: >-
      backlog task list performs only the remote and cross-branch work required
      by configuration without duplicate refreshes or redundant corpus loads
    checked: true
  - index: 5
    text: >-
      Focused automated tests assert the Git-operation boundaries for task view,
      shorthand, edit, and list
    checked: true
  - index: 6
    text: >-
      Before-and-after timings on a representative repository demonstrate faster
      task view, task edit, and task list behavior
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
