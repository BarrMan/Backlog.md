---
task_schema_version: 2
id: BACK-720
title: Store structured task fields exclusively in YAML frontmatter
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-09-30 16:55'
updated_date: '2026-10-01 04:40'
labels: []
dependencies: []
type: enhancement
ordinal: 354000
description: >-
  User approved replacing structured Markdown body interpretation with explicit
  YAML frontmatter fields. Keep human-readable Markdown files as authoritative
  storage, with free-form bodies that are not interpreted as task state.
implementation_plan: >-
  1. Store task, decision, and milestone structured fields in YAML frontmatter,
  treating bodies as opaque content. 2. Provide explicit preview/apply migration
  with full preflight, existing store locks, per-file atomic writes, and
  unsupported/ambiguous input diagnostics. 3. Preserve custom metadata and
  update runtime consumers, decision views/search, and public instructions. 4.
  Migrate fixtures, verify data-preservation regressions, run integrated
  type/lint/build and scoped behavioral checks.


  5. Diagnose and repair the branch-ref statistics watcher timeout with bounded
  phase evidence under the four-file worker run; preserve native Git watching
  and verify a targeted loop.


  User-approved post-migration cleanup: parallel current decoder simplification,
  deletion of migration and body-section modules/guidance, and retirement of
  legacy tests. Audit consumers and marker restrictions, verify migrated corpus,
  run integrated checks. Current-branch task creation is blocked by unmigrated
  historical branch records during ID allocation, so this is tracked on
  BACK-720.


  User-approved follow-up: centralize reusable frontmatter keys, domain
  lifecycle values, API protocol strings and task labels using parallel agents;
  integrate all matching consumers and verify existing behavior.
implementation_notes: >-
  Hardened v2 structured-frontmatter validation, preserved opaque body
  whitespace and checklist indices, and made migration preflighted, locked,
  atomic, and schema-version safe. Added focused storage and migration tests;
  scoped test, TypeScript, and targeted Biome checks pass.


  Owned focused suites updated: Definition-of-Done validation checks retain
  malformed-field and atomic-write guarantees under the current validation
  envelope; task-collection watcher test registers before mutation. Five owned
  suites pass. Blocker: document create/read returns an added trailing newline
  because the v2 parser now preserves raw content; server-documents-endpoint
  remains intentionally failing pending a parser-scope decision.


  Moved decision Context/Decision/Consequences/Alternatives and milestone
  Description to versioned YAML frontmatter. Added explicit decision/milestone
  preview/apply migration, preserved unknown metadata on ordinary decision
  saves, and added focused opaque-body/multiline tests. Targeted test, Biome,
  and build pass.


  Migrated owned v2 fixtures and opaque-body assertions. Isolated batch: 132
  pass across 10 files; preserved failures expose parseDocument adding a leading
  rawContent newline (markdown.test.ts) and milestone due-date clearing
  retaining the prior date (due-date.test.ts). Targeted Biome passes.


  Hardened explicit migration: all task/draft/decision/milestone candidates are
  scanned before locks and preflight, task/draft/create locks match their
  stores, missing configured directories are skipped, and duplicate legacy
  structured headings are reported without writes. Added focused cross-store
  preflight, configured prefix/archive/draft, missing-directory, and rejection
  coverage.


  Updated README, CLI overview instructions, and agent guidelines with schema-v2
  frontmatter examples; documented opaque bodies and preview/apply migration
  semantics without a whole-batch transaction claim. Verified generated overview
  output, agent-instructions test (18 pass), and targeted git diff --check.


  Wired existing task/draft parsed frontmatter through serializeTask and made
  decision content updates pass submitted frontmatter as the replacement
  metadata source. Added focused metadata/opaque-body regressions. Targeted
  task/draft and decision-replacement tests, TypeScript, and touched-file Biome
  pass; broader decision tests remain blocked by the concurrently owned
  serializer emitting alternatives: undefined.


  Updated decision consumers: web renders and edits Context, Decision,
  Consequences, and Alternatives as Markdown-backed structured fields; PUT now
  uses a typed JSON decision payload and preserves opaque rawContent; decision
  search indexes every structured field. Added structured search and real HTTP
  field round-trip coverage. Targeted search suite, TypeScript, and targeted
  Biome pass. server-documents-endpoint has three unrelated collision-fixture
  failures from current serializer handling of undefined values; the new
  round-trip test passes within that run.


  Updated owned milestone test fixtures to use serializeMilestone schema-v1
  frontmatter, preserving zero-padded IDs and filename/frontmatter mismatch
  coverage. MCP rename test now asserts frontmatter description; three isolated
  suites pass (2 + 28 + 34 tests).


  Investigated the reported server watcher flakes. BrowserServices installs
  native directory watchers before its initial graph reconcile completes;
  watchConfigFile primes its cached content before subscribing, and its
  asynchronous initial stable read only calls onConfigChanged when content
  differs. Ran server-lifecycle and server-statistics-endpoint 12 consecutive
  times each under the same 10s timeout (24/24 green; 11 and 5 tests
  respectively). No ownership/race defect reproduced and no timeout or watcher
  change was made.


  Final diagnostic blocker: migration-required and unsupported task/record
  schema errors now propagate through task, decision, milestone, and
  branch-loader recovery paths, while malformed YAML remains tolerant. Added
  dedicated propagation coverage; focused diagnostic and branch-resilience tests
  pass, and touched-file Biome plus diff-whitespace checks pass. TypeScript
  remains blocked by pre-existing Readable BodyInit errors in
  src/test/cli-browser-port.test.ts.


  Investigated the full-run branch-ref statistics timeout. The supplied
  four-worker log reaches the wait after a successful branch commit; it does not
  record an error publication. Added bounded 4s diagnostics for
  restart-with-Git-branch, branch commit, and watcher publication (including
  lifecycle error detection), without increasing the test timeout or changing
  watcher behavior. Isolated suite and three requested four-worker runs pass
  (35.7s, 39.5s, 36.4s). The intermittent failure was not reproduced; a future
  occurrence reports the exact stalled phase instead of a generic 10s timeout.


  Completed post-migration deletion and current-format verification. Follow-up
  constants pass adds shared frontmatter schema keys (including nested
  checklist/comment keys), task storage/source and agent session lifecycle
  values, browser/server API routes and HTTP constants, and shared task field
  labels. Canonical consumers now reuse their owning definitions; API route
  builders preserve literal types and browser config-source imports are
  type-only. Integrated verification: 481 tests across 27 isolated suites
  passed; TypeScript, full Biome, build and src diff whitespace checks passed.
  Separate task creation for the constants pass remains blocked by historical
  Git branch records without current schema versions. Prior full-suite
  statistics watcher timeout and BACK-715 performance goal remain unresolved;
  this verification was targeted.
final_summary: >-
  Moved application-owned structured task, decision and milestone data into
  versioned YAML while preserving opaque Markdown bodies and custom metadata.
  Completed repository migration and removed retired body parsers, migration
  commands, historical YAML repair and scalar-assignee compatibility.
  Centralized reusable schema, lifecycle, API protocol and interface label
  strings. Latest integrated targeted verification: 481 tests across 27 suites,
  TypeScript, Biome and build passed. Full-suite watcher/performance work
  remains tracked separately on BACK-715; historical branch schema records still
  block new task ID allocation.
acceptance_criteria:
  - index: 1
    text: >-
      All application-owned task fields round-trip through frontmatter with
      readable multiline text
    checked: true
  - index: 2
    text: >-
      Normal task reads and writes do not interpret body headings markers or
      checkboxes as structured task data
    checked: true
  - index: 3
    text: >-
      An explicit migration preserves existing legacy task data and free-form
      content
    checked: true
  - index: 4
    text: >-
      CLI and other surfaces retain task behavior and shipped documentation
      describes the new format
    checked: true
  - index: 5
    text: 'Relevant integration tests, TypeScript, formatting and build pass'
    checked: true
  - index: 6
    text: >-
      Retired storage parsers, migration subsystem and historical YAML repair
      are removed after completed migration
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
