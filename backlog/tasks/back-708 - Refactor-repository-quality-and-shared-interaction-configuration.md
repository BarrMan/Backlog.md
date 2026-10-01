---
task_schema_version: 2
id: BACK-708
title: Refactor repository quality and shared interaction configuration
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-29 04:11'
updated_date: '2026-09-30 06:57'
labels: []
dependencies: []
ordinal: 342000
description: >-
  User requests Fallow installation and complete findings cleanup,
  whole-repository SOLID architecture review and refactoring, reusable named
  constants, and centralized keyboard mappings after the Workspace checkpoint.
  Terminal behavior remains unresolved and must not be claimed fixed by static
  cleanup.
implementation_plan: >-
  1. Complete parallel exclusive CLI registration, Core dependency ownership,
  browser lifecycle/TSX, TUI state/lifetime, and Markdown responsibility tracks;
  preserve existing working changes and public behavior. 2. Coordinator reviews
  server validation and ContentStore publication seams and integrates shared
  dependencies. 3. Run bounded regressions, integrated types/lint/build, and one
  fresh authoritative full Fallow report; fix or individually explain every live
  finding with source evidence. 4. Refresh external architecture review and
  findings ledger, verify acceptance criteria honestly, and retain separate
  real-provider acceptance unless actually verified.
implementation_notes: >-
  Browser/server slice: centralized five browser-global shortcut actions and the
  search hint in src/web/lib/keyboard-shortcuts.ts; preserved input-owned keys
  and accessibility activation. Added shortcut tests and consolidated server
  WebSocket publication plus server timing/port policy constants. Focused tests
  pass. Scoped Biome checks pass. Full TypeScript and repository Biome checks
  remain blocked by concurrent unrelated changes outside this slice.


  Backend review/refactor: centralized the default status policy through
  DEFAULT_STATUSES/FALLBACK_STATUS for initialization, migration, and
  agent-session activation; named statistics retention/display limits; and
  shared day conversion across Git and statistics. Reviewed agent-workspace,
  core, file-system, git, markdown, utils, and types hotspots. The workspace UI
  entry still accepts full Core and uses it broadly, so a narrow UI port would
  require a UI-owned composition refactor; recommend a future UI task rather
  than narrowing only AgentSessionService. Focused tests (104) and changed-file
  Biome pass; build passed. Full Biome and current tsc are blocked by concurrent
  unrelated files, including .fallowrc.json, server/UI formatting and
  stale-symbol/type errors in completions, constants, markdown, MCP, UI, and
  utils.


  Installed exact fallow@3.30.0 and added explicit CLI, MCP registry, script,
  and Bun-test entry points. Removed 56 owned dead exports/declarations; 54
  focused MCP/root-discovery tests and the build pass. Full Fallow report is
  stored outside the repository at
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/fallow-final.json.
  Remaining repository findings require coordinator allocation; excluded src/ui,
  src/web, src/core, and src/agent-workspace findings were not edited.


  Implemented the TUI keymap defaults and migrated shared help/footer,
  board/task-list, popup, generic-list, composer, and filter-header bindings.
  Focused TUI regressions and lint pass. Full tsc remains blocked only by
  pre-existing unused declarations in src/mcp/validation/tool-wrapper.ts,
  src/mcp/workflow-guides.ts, and src/utils/find-backlog-root.ts.


  Fallow scope audit: added the real browser entry src/web/index.html;  now
  reports 543 files and 319 entry points, including that HTML entry. Matching
  fallow-type-aware@3.30.0 is already installed as fallow's optional companion.
  Fresh reports: /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/latest.json
  and latest-type-aware.json. Type-aware ran but warned of a stale declaration
  hash, so it retained conservative syntactic findings; no suppression or code
  deletion was performed. Exact counts: check.total_issues=134 (including 73
  private_type_leaks), health.findings=401 in a separate report field,
  dupes.clone_groups=109. No unused value exports remain; unresolved ownership
  is src/server/search.ts, seven type exports, 33 class members, and unused
  devDependency install.


  Final Fallow refresh after removing unused devDependency install: syntax
  report has 61 check findings, 402 health findings, and 109 clone groups.
  Type-aware report has 152 check findings because it separately includes 105
  private type leaks; health is also 402 and dupes 109. Its semantic pass
  completed cleanly and confirmed 14 of 41 candidate class-member references as
  used, reducing unresolved class members from 34 syntactic to 20 without
  suppressions. Full latest files remain in the system temp directory named in
  the prior note.


  Constants audit slice: centralized default status names, initialization
  defaults, lifecycle directory paths, agent handoff states/config filename, and
  Git commit retry policy. Scoped tests (26) and changed-file Biome pass; full
  TypeScript remains blocked only by the concurrent browser keyboard-shortcuts
  type error.


  Fallow clone inventory refreshed read-only: current configured scan reports 80
  groups (not the earlier 87/109). Recorded all 80 classifications and exact
  refactor scopes in
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/duplicates-review.md:
  51 genuine duplicated policy/algorithm groups and 29 intentional structural
  similarities. No production files changed.


  Checkpoint committed as 436a8ab before refactoring; Workspace terminal report
  remains unresolved in BACK-707.3. Installed pinned Fallow and semantic
  companion3.30.0 with accurate CLI/browser/test entrypoints. Integrated Fallow
  dead-code check is clean; cycles removed. Full pipeline still fails on36 clone
  groups (1.8% duplication) and389 health findings: ALL-findings request remains
  incomplete, with no health/duplication baselines or raised thresholds.
  Refactored CLI init/list/edit, core task update/init/milestones, filesystem
  config/milestones, session process/worktree boundaries, browser state/data
  hooks, and shared UI policies. TUI and browser handlers/hints use central
  keymaps; remapping dispatch tests and accessibility labels added. Defaults
  centralized with distinct historical fresh/migration/runtime semantics
  preserved. Timeout correction: no20minute tests; bounded batches replace
  whole-suite runs. Board readiness and pending-write completion now drive test
  synchronization; explicit empty argv preserved by test helper. Integrated
  tsc/Biome/build pass. Bounded regression verification1165pass10skip0fail;
  final keyboard labels24focusedpass. Full architecture review and remaining
  findings: /Users/imribarr/docs/Backlog.md/refactoring-review.md. Task remains
  In Progress until remaining Fallow/architecture findings are resolved or
  individually justified.


  Scoped commands/completions/guidelines/scripts health audit: created
  command-modules-findings-review.json with 56 exact original path/name/line/col
  records, metrics, branch ownership, relevant tests, and source-backed
  dispositions. No production edit was safe or justified in concurrently
  modified command/wizard modules; existing task-list and task-edit helpers are
  recorded as resolved boundaries. Focused completion tests: 21 pass; review
  JSON Biome check passes; exact tuple reconciliation against
  fallow-continuation.json passes.


  Command-module completion: reassessed all 10 formerly unresolved genuine
  records. Refactored five concrete boundaries: init integration option policy,
  wizard string-list diff policy, help-schema block-list parsing, selected
  MCP-client setup, and MCP shutdown registration. Reclassified five as cohesive
  request/wizard/create/scalar/watch transactions with source-specific
  rationales. Moved the complete 56-record ledger via apply_patch to
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/command-modules-findings-review.json;
  no root artifact remains. TypeScript passes; 24 focused command tests pass;
  direct changed-file Biome check pending.


  Verification complete: direct Biome check of the five changed command files
  passes. The package check wrapper remains blocked only by unrelated concurrent
  UI formatting in src/test/ui-state-owners.test.ts, src/ui/board.ts, and
  src/ui/task-viewer-with-search.ts.


  Continuation completed source-specific reconciliation: all 385 current health
  findings and 26 clone fingerprints have individual dispositions in
  /Users/imribarr/docs/Backlog.md/refactoring-findings.json, with methodology
  and architecture map in /Users/imribarr/docs/Backlog.md/refactoring-review.md.
  Confirmed responsibility/duplication problems were refactored, including
  query/editor flows, CLI filter parsing, modal lifecycle/keyboard/list
  policies, board transitions, viewer selection generations, serialization
  section updates, and shared milestone aliases. Local task-search regression
  introduced during refactoring was caught and fixed with Core and CLI coverage.
  Final enabled Fallow check categories report zero issues; duplication is 1.3%.
  IMPORTANT: check:fallow -- --summary still exits 1 on unchanged
  health/duplication gates (385 findings, 26 clone groups); acceptance criterion
  1 is met by individual source-backed explanations, not zero warnings, raised
  thresholds, or suppressions. Private-type-leak remains disabled and is not a
  verified clean category. Final integrated TypeScript, repository Biome, and
  build pass. Bounded integration tests: 557 pass, 1 skip; subsequent parser
  verification: 28 pass. No full-suite clean-run claim. BACK-707.3 terminal
  report remains unresolved. Refactoring changes remain uncommitted.


  Implemented remaining duplication rather than accepting review explanations:
  fresh integrated Fallow reports zero clone groups (previously 26) and zero
  enabled dead-code issues. Added shared document lifecycle/rendering, typed
  config policies, task/draft creation reporting, search/doctor command
  responsibilities, scalar mutation rules, serialization frontmatter policies,
  CLI/session subprocess capture, TUI popup/lifecycle/navigation policies, and
  generation-scoped optimistic modal updates. Modal rendering split into content
  and metadata owners; cognitive/cyclomatic improved from 145/119 to 75/51.
  Workspace key handling cognitive 50 to 17. Bulk move orchestration 37/68
  cyclomatic/cognitive to 5/4; its ordered planner still reports 24/35.
  SideNavigation 49/70 to 20/42. Remaining health findings: 396 total,
  comprising 161 structural threshold findings and 235 estimated-CRAP-only
  findings. Total is higher than the 385 baseline because new smaller helpers
  receive separate estimated-coverage scores; do not claim all health work
  finished. No thresholds/baselines/suppressions changed. Final tsc, repository
  Biome, and build pass. Bounded backend/CLI integration: 349 pass; all nine
  modal suites: 65 pass; targeted UI/Workspace/document/server checks pass.
  Browser integration exposed an accidentally removed isTerminalStatus import
  after extraction; restored it and reran affected suites successfully. Current
  report:
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/fallow-remaining-final-verified.json.
  Updated /Users/imribarr/docs/Backlog.md/refactoring-review.md and explicitly
  marked the prior disposition ledger historical. Keep In Progress for remaining
  complexity implementation; original Workspace terminal report remains separate
  and unresolved. No new commits.


  Committed verified refactoring checkpoint as 94f5b70. Continuing remaining
  structural complexity reductions with parallel agents; coordinator owns
  integration and assists difficult cases.


  Parallel follow-up after checkpoint: introduced modal action owner with
  lifecycle epochs, sidebar section shell, ordered-move planner, and typed
  ordered serialization policies. Coordinator review directed fixes for
  same-task reopen/unmount/refresh races and removed arbitrary microtask timing
  yields. Core query freshness previously compared live backlogDir getters on
  the same FileSystem; immutable read context now covers query/get/subtasks, and
  local queries recheck after asynchronous milestone filtering. Added deferred
  regression for that second race. Final integrated analyzer: zero enabled
  dead-code issues, zero clone groups, 393 health findings (156 structural, 237
  estimated-CRAP-only), down from 396 total/161 structural at checkpoint.
  Serializer has zero health findings; ordered planner maximum13 cyclomatic/12
  cognitive from24/35; snapshot attempt17/11 from24/18; modal46/67 from51/75;
  sidebar16/39 from20/42. Final tsc/Biome/build pass. Bounded verification:
  Core/Board/search87pass, serialization81pass, sidebar4pass;
  modal/deeplink99pass followed by changed-suite23pass including one added
  save-ABA regression (100 distinct modal/deeplink cases). Fresh report
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/back-708-post-checkpoint-final.json.
  Durable external review updated. Keep In Progress: remaining health findings
  unresolved; no threshold/suppression changes.


  Focused web slice progress: extracted document save transaction, modal
  focus/keyboard containment, type palette selection, and Mermaid rendering
  fallback into cohesive helpers. Direct Biome and diff checks pass; targeted
  tsc output contains no errors from these files. Full tsc remains blocked by
  concurrent errors in task-list-project, content-store, milestone-workflow, and
  overview-tui. Remaining assigned structural findings in DecisionDetail,
  DependencyInput, InitializationScreen, and search-command-query still require
  implementation.


  BACK-708 route slice: split route matching and task-modal authority into
  focused hooks. Fresh Fallow health report
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/back708-round3-web-final-2.json
  confirms zero structural findings in useTaskRouteDetail and its new helpers.
  AppContent (34/70) and refreshTasksData (18/17) remain unchanged and require a
  cohesive app data lifecycle extraction. Direct Biome passes and targeted tsc
  has no errors in these hook files. The route regressions currently fail due
  concurrent TaskDetailsContent runtime access to missing task.documentation,
  outside this slice.


  BACK-708 UI slice: refactored Statistics and CleanupModal into named view
  sections; simplified statistics, cleanup, and settings hook state transitions;
  removed the unused StatisticsData export. Fresh Fallow health report at
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/back708-owned-health.json
  has zero findings for SideNavigation, Settings, CleanupModal, Statistics,
  their hooks, and statistics-sections. Owned-file TypeScript diagnostics are
  clean. Focused navigation/cleanup test run had 6 pass and one pre-existing
  concurrent failure: normalizedFilterLabels is undefined while rendering
  SideNavigation.


  Correction: the fresh scoped report has zero findings for CleanupModal,
  Statistics, use-cleanup-modal, use-settings-form, use-statistics-data, and
  statistics-sections, but still reports Settings (21 cyclomatic/20 cognitive)
  and SideNavigation (16/25). Those two remain unresolved in this slice; do not
  treat the preceding note as a zero-finding claim for them.


  Exclusive TUI slice complete: normalized viewer configuration and initial
  filter ownership moved to task-viewer-configuration; detail metadata now uses
  typed descriptors split by identity/workflow fields; removed the unused
  TaskDetailContentOptions re-export. Fresh health report
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/back708-task-viewer-final.json
  has no structural findings in the two source files or helper (remaining owned
  entries are CRAP-only). Scoped Biome and git diff --check pass; existing
  bounded TUI tests pass: task-viewer-boundary-navigation 13 and
  tui-task-composer 74. Repository tsc/Biome remain blocked by concurrent
  web/board errors outside this slice; no commit made.


  Browser list/board continuation: wired TaskList to TaskListRow, preserved row
  click/button behavior and accessible title label, consolidated Board lane
  column props, removed stale helper imports, and moved lane
  grouping/progress/visibility into use-board-lane-view. Owned-path Fallow
  filter: 0 check findings, 0 clone groups, 5 health findings remain (TaskList
  filter effect/owner, Board root, TaskColumn). Scoped TypeScript diagnostics
  are clean; 75 UI tests had 74 pass and one external jsdom failure in
  keyboard-shortcuts.ts because Element is undefined. Diff check passes. Report:
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/browser-board-list-final.json.


  Board slice: extracted canonical column ordering/render-item/visibility
  policy, screen ownership, move projection/recruitment policy, and optional
  move-filter input policy. Preserved board session as the state authority.
  Required Fallow report:
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/board-architecture-final.json;
  owned non-CRAP structural findings: zero. Targeted board UI/move/popup tests:
  34 pass; owned-file TypeScript diagnostics: zero. Full repository Biome
  remains blocked by concurrent files outside the exclusive board slice.


  Core architecture slice: extracted task creation transaction orchestration
  (validation/allocation/write/publication/commit/rollback), config migration
  lifecycle (schema/legacy milestones/draft-prefix), and task query/search
  filtering policy into three Core workflow modules. Core remains the
  state/freshness/cache owner and caller-facing facade. backlog.ts is 3,213
  lines (down 197 from 3,410); new modules total 238 lines. Scoped Biome and git
  diff --check pass; src/test/core.test.ts passes (64 tests, 24.78s). Required
  full-repo Fallow command was run exactly as requested but exceeded the 120s
  command limit and was SIGTERM'd before publishing a report, so no Fallow
  metric/result is claimed. Full tsc remains blocked by concurrent CLI/UI errors
  outside this slice.


  Milestone browser slice: removed duplicate add/edit modal wrappers in favor of
  direct shared-form use; extracted API request actions and page bucket
  filtering/grouping from UI state ownership. Added add-modal in-flight and
  failure-close timing coverage. Scoped milestone suites: 17 pass; direct Biome
  and diff checks pass.


  Core architecture continuation: TaskReadSession now owns generation-stable
  query/get/subtask cache-readiness and retry behavior; TuiTaskEditSession owns
  preparation, terminal/editor lifecycle, locked draft validation, reparse, and
  cache publication. Core is the dependency-composition facade. Preserved the
  watcher-gated query refresh versus unconditional warm get refresh distinction.
  Scoped Biome and diff check pass; bounded Core/search/TUI batch: 96 pass in
  48.44s. Atomic CLI regressions are currently blocked by concurrent cli.ts
  CONFIG_GET_KEYS/parse errors outside this slice.


  Launched all ten approved implementation tracks concurrently plus a separate
  read-only regex auditor. Integrated TypeScript passed after Markdown
  capture/import corrections. Delivered server endpoint/host/WebSocket
  boundaries, filesystem repository/cache/lock owners, project/task service
  partial extraction, Git selected-commit transaction, workspace SessionStore,
  MCP root activation, Markdown scanner/range modules, browser app composition
  and TUI feature folders. CLI registration remains 2163 lines; Core vacating
  lifecycle transactions and TUI controller closure ownership remain incomplete
  despite follow-up delegation. Do not claim architectural completion. Regex
  audit identifies duplicate heuristic YAML decoding, duplicated Markdown
  structural extraction and unnecessary dynamic ID regexes; exact static regex
  inventory remains unverified because installed TypeScript lacks JS compiler
  AST API. Findings are read-only recommendations; Markdown source-of-truth
  contract preserved. No commit made.


  Starting exclusive MCP architecture reassessment and refactor.


  Core correction: added VacatedTaskReferenceService as the sole owner of
  active/completed reference scanning, stable lock widening, cleanup writes,
  ContentStore projection, and archive/demotion moved-state metadata. Core
  archive and both demotion paths now delegate to it; public Core adapter
  contracts and filesystem/Git interfaces remain unchanged. Verification: Biome
  on the two Core files, git diff --check, vacated-task-references (21 pass),
  and core.test (64 pass, 45.47s).


  Browser architecture continuation: moved the real initialization wizard and
  step views into src/web/features/initialization and removed the forwarding
  InitializationScreen; moved milestone bucket filtering/grouping to
  src/web/features/milestones; selection now owns visibility reconciliation
  instead of leaking setters to use-board-visible-selection (removed); removed
  the Board accessibility suppression with a keyboard-aware labeled region;
  removed redundant TaskDetail-to-Task casts; settings load/save and success
  notification publishing are request-epoch and unmount guarded. Verification:
  bounded render batch 99 pass/0 fail in 4.58s (board, milestones,
  initialization, modal keyboard/ABA/unsaved navigation/final-summary);
  changed-path Biome and diff checks pass. Milestone failure-case test
  intentionally logs its mocked creation failure while passing.


  MCP slice: McpServer now composes Core as application; McpRootActivation
  explicitly owns roots-driven Core transitions and emits a single capability
  transition. Tools receive Core directly; full/fallback registration, stdio,
  roots, schemas/resources/errors remain adapter-owned. Bounded MCP regression:
  35 pass in 9.99s; scoped Biome and diff check pass. Full tsc remains blocked
  by concurrent non-MCP errors plus untouched MCP fixtures that still reference
  the previous inherited test API.


  Filesystem/ID correction: exported decodeConfigYaml(content: string, key:
  string): { value: unknown | undefined } | { error: unknown } from
  file-system/config.ts; list values and Definition-of-Done now share its
  key-local YAML decode with full-document alias fallback and tested legacy
  backslash recovery. Replaced unescaped dynamic ID prefix regexes with literal
  prefix parsing and constrained Git-tree allocation to numeric IDs from
  Markdown basenames. Added entity metacharacter-prefix coverage. Scoped
  verification: 39 tests pass in 18.96s; direct Biome and diff checks pass. CLI
  help-schema was not edited.


  TUI ownership continuation: BoardSession now contains
  move/recruit/cancel/pending-write transitions and immutable snapshots;
  TaskViewerSession owns corpus filtering, selection generations, overlays, and
  no-results state; UnifiedViewSession owns watcher publication/subscriber
  lifetime. Removed the task-viewer filter-render callback bag and one board
  unsafe screen cast. Added UI session regressions (4 pass) and scoped
  Biome/type diagnostics clean. The existing board and viewer controllers still
  contain Blessed widget adapters and remaining legacy local aliases, so this is
  not yet the requested one-owner-per-state completion; no package/core files
  changed.


  Paused implementation at user request and wrote comprehensive next-agent
  handoff: /Users/imribarr/docs/Backlog.md/refactoring-handoff.md. It records
  maintainability goals/principles, implemented boundaries, incomplete CLI
  extraction, Core lifecycle dependency blocker and required utility scope,
  current browser follow-up edits, verification limits, analyzer evidence, and
  restart sequence. Handoff checks: integrated tsc passes; configured repository
  Biome passes (657 files), but biome.json excludes TSX, so this is not browser
  lint coverage. Current browser modal-lifecycle and deep-link suites: 34 pass,
  0 fail. Build/full Fallow not rerun after latest parallel round. Task stays In
  Progress; BACK-707.3 real-provider acceptance remains unresolved. Preserve all
  uncommitted work; no commit made.


  Completed parallel CLI/Core/browser/TUI/Markdown/storage/server refactoring
  and source-backed review. CLI task registration and shared policies now have
  feature owners; Core lifecycle and mutations consume concrete dependencies,
  branch state has one session owner, and ContentStore uses explicit filesystem
  mutation subscriptions. Preserved ordinal-only updatedDate and status callback
  output; deferred tests cover disposed-store and allocation/reinitialization
  races. Browser route data, milestone workflows, initialization and column
  cards have cohesive owners; TSX is included in lint and lint-staged. Repaired
  source worker/test executable references after CLI entry migration. Final tsc,
  repository Biome (802 files incl TSX), build, compiled CLI/browser/MCP smoke
  and targeted diff checks pass. Bounded regressions passed; no full-suite
  claim. Final Fallow report back708-final-runtime-verified-20260930.json: 0
  enabled check issues, 319 health findings (28 structural/291
  estimated-CRAP-only), 1 intentional typed milestone-facade clone. All 320
  findings have individual source-specific explanations and validated references
  in /Users/imribarr/docs/Backlog.md/refactoring-findings.json; health gate
  remains failing, completion is under resolved-or-individually-explained AC,
  not zero thresholds. Architecture review and handoff refreshed. Existing
  permissive HTTP validation/full-replacement semantics preserved pending
  separate product decision; BACK-707.3 real-provider acceptance remains
  unresolved. No commits; existing uncommitted baseline and .envrc preserved.
final_summary: >-
  Completed maintainability refactoring with parallel exclusive subsystem owners
  and integration review. CLI command families, concrete Core
  mutation/lifecycle/session dependencies, filesystem publication, Markdown
  ownership, TUI state and browser workflows now have clearer responsibilities.
  Fixed metadata, stale-session allocation/store and CLI worker-path regressions
  found during verification. Verified TypeScript, Biome including TSX, build,
  compiled CLI/browser/MCP smoke, and bounded relevant regression suites. Fallow
  enabled checks are clean; 319 health records and one intentional
  facade-signature clone are individually explained in the external evidence
  ledger with unchanged analyzer thresholds. No full-suite or real-provider
  terminal acceptance claim. Changes remain uncommitted.
acceptance_criteria:
  - index: 1
    text: >-
      Fallow is installed and all reported findings are resolved or individually
      explained with evidence
    checked: true
  - index: 2
    text: >-
      Architecture review covers repository subsystems and verified refactors
      address concrete responsibility and dependency problems
    checked: true
  - index: 3
    text: Reusable policy values have shared named owners
    checked: true
  - index: 4
    text: >-
      Keyboard handlers and displayed shortcuts consume centralized keymapping
      configuration
    checked: true
  - index: 5
    text: 'Type checking, lint, build and relevant regression tests pass'
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
