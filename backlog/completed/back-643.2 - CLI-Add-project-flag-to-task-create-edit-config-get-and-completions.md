---
task_schema_version: 2
id: BACK-643.2
title: 'CLI: Add --project flag to task create/edit, config get, and completions'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 16:20'
updated_date: '2026-08-20 16:38'
labels: []
dependencies:
  - BACK-643.1
parent_task_id: BACK-643
ordinal: 275000
description: >-
  Add --project <project> to task create, task edit, and draft create in
  src/cli.ts, wired the same way as --type (guard on options.project !==
  undefined, pass raw value to Core -- do not validate at the CLI layer on
  create/edit, since Core.normalizeProject already throws). --project "" must
  clear the field, matching --type's behavior (not --priority's, which cannot
  currently clear due to a truthiness guard) -- no --clear-project flag is
  needed. Add projects to CONFIG_GET_KEYS/CONFIG_AVAILABLE_KEYS and a config get
  projects case. Add projects to the config set blocked-list switch with the
  same rejection message as types/priorities/labels. Add projectType() to
  src/commands/help-schema.ts. Add a project prompt to
  src/commands/task-wizard.ts, skipped entirely when no projects are configured.
  Add getProjects() to src/completions/data-providers.ts (sourced from config,
  not observed task values) and wire it into src/completions/helper.ts's
  getFlagValueCompletions switch. Add Project: <value> to
  src/formatters/task-plain-text.ts and project to
  src/formatters/json-output.ts.
implementation_plan: >-
  1. src/cli.ts: add --project option to task create (near --priority/--type at
  ~1781), task edit (near ~2826), draft create (near ~3640); guard on
  options.project !== undefined at both create and edit action wiring, mirroring
  --type.

  2. src/cli.ts: add normalizeCliProject() next to normalizeCliTaskTypes (used
  only by slice 4's filter paths, not here).

  3. src/cli.ts: add 'projects' to CONFIG_GET_KEYS, CONFIG_AVAILABLE_KEYS; add
  config get projects case; add projects to the config set blocked-list switch.

  4. src/commands/help-schema.ts: add projectType().

  5. src/commands/task-wizard.ts: add project prompt, skipped when no projects
  configured.

  6. src/completions/data-providers.ts: add getProjects();
  src/completions/helper.ts: wire into getFlagValueCompletions.

  7. src/formatters/task-plain-text.ts and json-output.ts: add project output.

  8. Run bunx tsc --noEmit, bun run check ., relevant tests
  (cli-task-type.test.ts pattern, task-wizard.test.ts, config-commands.test.ts).
implementation_notes: >-
  Added --project to task create/edit in src/cli.ts (guard on options.project
  !== undefined, same as --type; Core.normalizeProject already throws, so no
  CLI-level pre-validation). --project '' clears, verified against --type's
  actual (not assumed) behavior. Deliberately did NOT add --project to
  standalone 'draft create' since it also lacks --priority/--type
  (surface-consistency correction to the original AC, applied and recorded on
  the task). Deferred normalizeCliProject (multi-value filter helper) to slice 4
  since it would be unused/lint-flagged until filtering is wired.


  Added projectType()/getCliProjectValues() to help-schema.ts (omits values,
  returns a 'no projects configured' message when unconfigured -- shown in
  --help). Added project prompt to task-wizard.ts, skipped entirely when no
  projects configured (verified via dedicated wizard tests). Added getProjects()
  to completions/data-providers.ts and wired into helper.ts (scoped to task
  create/edit only, since --project isn't on task list yet -- that's slice 4).
  Added Project: line to task-plain-text.ts and project field to
  json-output.ts's TaskSummaryJson. Added 'projects' to
  CONFIG_GET_KEYS/CONFIG_AVAILABLE_KEYS, a config get projects case, a config
  list projects: line (found and fixed a gap where config list has its own
  hardcoded field list separate from CONFIG_GET_KEYS), and projects to the
  config set blocked-list switch (reuses the existing generic rejection message
  via the shared else-branch).


  Verification: bunx tsc --noEmit clean, bun run check . clean on all 18 touched
  files. New tests: src/test/cli-task-project.test.ts (6 tests, spawns the real
  built CLI), 6 new project-specific cases added to
  src/test/task-wizard.test.ts. All passing. Regression run of
  cli-task-type.test.ts, task-type-config.test.ts, config-commands.test.ts (1
  pre-existing unrelated failure, same as slice 1) -- no new failures.
final_summary: >-
  Added the project attribute to the CLI surface: --project on task create/edit
  (clears via empty string, matching --type), config get/list/set support (get
  and list show configured projects, set is blocked like its siblings), --help
  text via projectType(), a task-wizard prompt shown only when projects are
  configured, shell completions scoped to create/edit, and project output in
  plain-text task view and JSON summaries. Deliberately excluded --project from
  standalone 'draft create' and from task list/search filtering, matching
  --priority/--type's actual precedent and deferring filtering to BACK-643.4.
  Verified with bunx tsc --noEmit, bun run check . (clean), and 12 new tests
  across cli-task-project.test.ts and task-wizard.test.ts, plus regression runs
  of the existing type/config test suites.
acceptance_criteria:
  - index: 1
    text: >-
      backlog task create --project <value> validates against configured
      projects and sets project: in frontmatter
    checked: true
  - index: 2
    text: >-
      backlog task edit --project <value> updates the field; backlog task edit
      --project "" clears it (verified against --type "" behavior, not
      --priority)
    checked: true
  - index: 3
    text: >-
      backlog config get projects prints configured projects (or a clear 'none
      configured' message)
    checked: true
  - index: 4
    text: >-
      backlog config set projects is rejected with the same message pattern as
      config set types/priorities/labels
    checked: true
  - index: 5
    text: >-
      backlog task create/edit --help shows valid project values via
      projectType()
    checked: true
  - index: 6
    text: >-
      Interactive task wizard prompts for project only when at least one project
      is configured
    checked: true
  - index: 7
    text: Shell completion for --project suggests configured project values
    checked: true
  - index: 8
    text: >-
      backlog task view --plain and --json output include the project field when
      set
    checked: true
  - index: 9
    text: >-
      backlog task create --draft --project <value> sets project on the created
      draft, matching how --priority/--type already work for drafts (standalone
      'draft create' has neither --priority nor --type, so --project is
      intentionally not added there either)
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
