---
task_schema_version: 2
id: BACK-428
title: Document npx backlog.md usage
status: Done
assignee:
  - '@claude'
created_date: '2026-04-25 12:14'
updated_date: '2026-07-04 17:49'
labels:
  - documentation
  - cli
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/566'
priority: low
description: >-
  Track GitHub issue #566: clarify that one-off npm execution uses the
  backlog.md package name.
implementation_plan: >-
  1. Add npx one-off usage (npx backlog.md <command>) to README Getting started
  install section, kept separate from global-install examples. 2. Add a short
  npx note to CLI-INSTRUCTIONS.md. 3. Grep repo to confirm no misleading 'npx
  backlog' (without .md) examples remain.
implementation_notes: >-
  README Getting started now has a GitHub TIP callout right after the install
  block explaining one-off npx usage requires the full package name (npx
  backlog.md init/board) and why bare npx backlog fails; global install examples
  untouched and clearly separated. CLI-INSTRUCTIONS.md intro now states all
  examples assume global install and shows npx backlog.md <command> for one-off
  runs. Grep verification: no 'npx backlog' (without .md) examples exist in
  user-facing docs; only historical completed-task records mention it, left
  untouched. Validation: bunx tsc --noEmit clean; biome check on
  src/scripts/*.json clean (305 files; note: 'bun run check .' scans 0 files
  inside .claude worktree paths due to gitignore-based VCS ignore, ran with
  explicit paths instead); scoped bun test documentation.test.ts 10/10 pass
  (doc-only change).


  Review correction: the earlier claim that bare 'npx backlog' fails with 'could
  not determine executable to run' was outdated — an unrelated npm package named
  'backlog' (an AI-agent orchestrator) now ships a 'backlog' bin, so a
  no-install 'npx backlog' silently runs a different tool. Both callouts
  reworded: state the package is named backlog.md so one-off runs must use 'npx
  backlog.md <command>', warn that no-install 'npx backlog' resolves to an
  unrelated third-party package, and scope the warning to one-off/no-install
  usage (with backlog.md installed as a local project dependency, 'npx backlog'
  resolving node_modules/.bin remains a supported flow per BACK-252/BACK-385).
  Verified via 'npm view backlog': name=backlog, bin=backlog, description=AI
  coding agent orchestrator.
final_summary: >-
  Documented one-off npx usage: README Getting started gains a TIP callout
  showing npx backlog.md <command> (full package name) and explaining that npx
  backlog fails because the npm package is backlog.md; CLI-INSTRUCTIONS.md intro
  notes examples assume a global install and gives the npx backlog.md form.
  Verified via grep that no misleading npx backlog examples remain in user docs.
  Doc-only change; tsc + biome clean, scoped test pass.
acceptance_criteria:
  - index: 1
    text: >-
      README examples show the correct npx backlog.md command form where one-off
      execution is documented.
    checked: true
  - index: 2
    text: >-
      Global install and direct backlog command examples remain clearly
      separated.
    checked: true
  - index: 3
    text: >-
      Documentation checks or grep verification confirm no misleading npx
      backlog examples remain.
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
