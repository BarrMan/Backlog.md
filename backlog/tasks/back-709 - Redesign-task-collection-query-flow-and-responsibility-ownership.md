---
id: BACK-709
title: Redesign task collection query flow and responsibility ownership
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-09-30 07:11'
updated_date: '2026-09-30 15:27'
labels: []
dependencies: []
references:
  - src/server/task-collection.ts
  - src/server/resources/tasks.ts
  - src/core/task-query-workflow.ts
  - src/core/backlog.ts
type: chore
ordinal: 343000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Correct browser task-collection ownership around a startup-owned, scoped ProjectTaskGraph. BrowserServices initializes the selected immutable Core/scope and graph before listening; the graph retains lightweight task summaries, canonical identity, dependency adjacency, and `isReady` state for collection and readiness reads. Task bodies remain persistent detail reads, not graph state. Filesystem, Git, configuration, and successful mutation events build and atomically publish a replacement scoped Core/graph before scoped WebSocket invalidations; malformed lifecycle configuration fails closed. Preserve shared CLI, MCP, and TUI semantics for filtering, canonical ambiguity, branch identity, cross-branch parents, readiness, full-text relevance, and locked semantic mutations. Existing web changes remain preserved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 BrowserServices prepares a scoped ProjectTaskGraph from one immutable Core snapshot before accepting browser requests.
- [x] #2 The retained graph owns lightweight summaries, canonical identity, dependency adjacency, and isReady state; task-detail bodies continue to load from persistent storage.
- [x] #3 Lifecycle and successful mutation events atomically replace the selected scoped Core/graph before publishing scoped WebSocket invalidations, and stale scopes are rejected.
- [x] #4 Malformed server lifecycle configuration fails closed without publishing or serving an invalid replacement scope.
- [x] #5 CLI, MCP, TUI, and browser-server callers preserve canonical filtering, ambiguity, branch, parent, readiness, full-text, and locked-mutation semantics.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify native Elysia status lifecycle behavior for successful, rejected, and exceptional mutations. 2. Make reconciliation depend on the authoritative response status and add scoped regressions. 3. Move collection query coercion into Elysia transforms while preserving aliases and run bounded server tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved expanded architecture: preserve milestone navigation; load lightweight view/filter task summaries; fetch details on selection; client-owned configurable LRU detail cache (default 10), hits touch recency without HTTP, misses fetch persistent storage; server does not cache task details; initialize required data/watchers/subscriptions before accepting requests. Existing work checkpointed as 5e499ca.

Implemented and integrated parallel startup, Core/storage/query, and client-cache work. Browser runtime initializes before listen; request handlers cannot initialize services. Collection reads own filter validation, canonical parent resolution, refresh and generation retries in Core. Legacy query parsing and cross-branch parent resolution for local collections preserved. Summary-only retained task corpus uses a body revision digest to propagate body-only edits without retaining bodies; persistent detail reads preserve canonical identity and source. Browser full-text search uses a transient corpus to preserve relevance/global limits without a task-detail cache. Client selection prefetch, pending-request reuse, access-order LRU (default 10), Settings capacity control, mutation/WebSocket invalidation, and summary-only mutation reconciliation verified.

Verification: 125 passing server/Core tests across 10 files and 126 passing web/cache tests across 11 files; bunx tsc --noEmit, bun run check ., git diff --check, and bun run build passed. DOM regressions exercise keyboard selection-to-Enter prefetch reuse, deep links, reopen, refresh races, and optimistic board mutations. Focused Fallow assessment: task-collection.ts has no threshold findings; queryCrossBranch remains cyclomatic 26/cognitive 27 and queryTaskSummaries 27/41, primarily scope/filter decisions and generation/error checks. These remain visible complexity findings, not suppressed; the architectural change is startup-owned readiness, summary/detail separation, and one Core collection request ownership rather than metric-only extraction.

Core/server request-data review: browser routes derive a fresh immutable request-local Core from the runtime scope. PersistentTaskRead loads Markdown/Git and builds identity/search/readiness data only for the active request; it neither subscribes nor retries. queryTaskSummaries browser path uses this reader directly, resolves legacy filters and canonical/cross-branch parents against one snapshot, and returns body-free TaskSummary records. Detail, search, statistics, duplicate repair, and mutations share request-local persistent resolution while ContentStore/SearchService initialization and project-root reassignment fail explicitly.

Added server-task-collection-query regression: two HTTP collection requests observe a Markdown edit; request-local Core rejects ContentStore/SearchService initialization and root reassignment. Review found no retained store/search dependency in src/server/resources.

Verification: bun test --timeout=10000 src/test/server-task-collection-query.test.ts src/test/server-statistics-endpoint.test.ts: 9 pass, 0 fail, 42 assertions. bunx biome check src/core src/server/task-collection.ts src/server/resources src/types/index.ts src/test/server-task-collection-query.test.ts: pass. git diff --check for owned surfaces: pass. Full bunx tsc --noEmit remains blocked by concurrent unrelated test migrations: server-tasks-spa-fallback still calls removed BrowserServices.store (5 errors plus implicit event type); web-app-open-detail-refresh expects FakeSocket.url.

Follow-up integration review: replaced obsolete BrowserServices.store and shared-Core test spies with request-local observable contracts. SPA tests now cover fresh working-copy details, real cross-branch padded-ID ambiguity, concurrent request-local branch reads, parent filtering from the same snapshot, local versus cross-branch collection visibility, ref changes between requests, and fail-closed malformed config followed by immediate repaired-config visibility. Live server search/detail/duplicate tests bootstrap projectScope from /api/status and attach X-Backlog-Project-Scope; duplicate WebSocket test uses the scope query contract.

Corrected PersistentTaskRead.get so a direct filesystem fallback returns the loaded task rather than discarding it, preserving legacy/non-indexed local task lookup semantics.

Verification: bun test --timeout=10000 src/test/server-tasks-spa-fallback.test.ts src/test/server-task-detail-dependency-graph.test.ts src/test/server-duplicate-repair.test.ts src/test/server-search-endpoint.test.ts src/test/server-task-collection-query.test.ts src/test/server-init.test.ts src/test/server-statistics-endpoint.test.ts src/test/task-search-parity.test.ts src/test/shared-branch-task-loader.test.ts: 125 pass, 0 fail, 625 assertions. bunx tsc --noEmit: pass. Targeted Biome and git diff --check for changed Core/server tests: pass.

Added FileSystem.freezeResolution() for runtime request-scope wiring. It canonicalizes the current backlog/config paths (including symlink targets) and prevents invalidateConfigCache() or root-config publish handling from changing storage resolution. Runtime should call core.filesystem.freezeResolution() after applying its per-request directory/config-location snapshot and before any handler read/mutation.

Removed dead retainTaskSummaries alternate Core path after confirming no callers in src; browser reads remain only request-local persistent reads. Added a race regression that pauses request-local config loading, changes root config from primary-backlog to replacement-backlog, and proves both getTask and updateTaskFromInput remain in the original directory.

Verification: targeted Biome and diff check pass; pinned race regression passes (1 pass). Full bunx tsc --noEmit is currently blocked by concurrent runtime resource refactor type errors (BrowserServices.scope removal and Elysia route core context), not by the frozen-resolution changes.

Replaced Core task reads with one PersistentTaskRead path: query, summaries/readiness, detail corpus, search, duplicate repair, task lookup, and working-copy identity now load request-scoped Markdown/Git snapshots. Removed TaskReadSession implementation and requestLocal constructor mode; Core accepts only enableWatchers. freezeResolution now canonicalizes supplied scope targets before pinning. Targeted Biome, git diff --check, and bunx tsc --noEmit pass.

Reopened after premature completion. Production callers now create immutable Core instances per operation: server request scopes freeze captured resolution, MCP validates and replaces Core instances on root changes, and CLI/MCP/TUI reads no longer retain ContentStore/SearchService or use the requestLocal mode. Server scope headers and WebSocket invalidation wiring remain explicit. Core-owned completion still needs the universal persistent read interface to replace its remaining internal corpus/session code.

Transferred Core cleanup completed: deleted src/core/content-store.ts; moved TaskCorpusSnapshot to task-loader; replaced retained SearchService with pure searchSnapshot; removed the TUI editor store-upsert hook; and made ordered placement require only a structural mutation resolver. Core backlog must now import TaskCorpusSnapshot from task-loader, use searchSnapshot directly, pass resolver to planOrderedTaskPlacement, and remove its remaining ContentStore/session lifecycle paths. Tests intentionally remain untouched and still reference removed APIs.

Removed the remaining Core retained-read/session architecture. Core now binds readonly filesystem and git with one PersistentTaskRead; mutations, lifecycle, and vacated-reference cleanup have narrow filesystem/Git/snapshot dependencies with no store publication. Restored one-shot search via searchSnapshot and TUI edit delegation without a store. Rollback transactions no longer require refresh callbacks; ordered moves use the structural resolver contract. freezeResolution preserves supplied canonical server scope targets exactly. Targeted owned-file Biome passes; targeted TypeScript output has no errors from owned files.

Integrated the new public Core accessors across production callers: Core.filesystem replaces Core.fs and Core.git replaces Core.gitOps; removed benchmark watcher constructor flags and obsolete disposal calls. MCP root resolution is verified to resolve before handler lookup, with registrations capturing one current Core instance per operation. Focused server scope/search tests (36) and MCP roots tests (8) pass. Full tsc now has only Core-owned internal accessor migrations and the test-suite migration remaining.

Fixed remaining owned production callers to use Core.git and Core.filesystem. Default Core construction now freezes its resolved storage targets; explicitly supplied server scope targets remain exact and are not re-realpathed. Added immutable-project-context regression: an in-flight default Core read remains in backlog A while root config changes to B, and a fresh Core reads B. The regression and server initialization tests pass; targeted Biome, diff check, and owned-file TypeScript diagnostics are clean.

Migrated owned tests to Core.filesystem/Core.git, removed retired cache lifecycle/options, replaced retained search/store assertions with persistent/fresh Core reads, and added scope headers to browser contention tests. Focused atomic edit, TUI, CLI, comments, and MCP suites pass (257 tests including 1 skip). tsc is blocked only by explicitly delegated test files. Atomic task demotion race still exposes a production PersistentTaskRead load/stat race when a task file moves during snapshot construction.

Removed PersistentTaskRead's post-enumeration Bun.file().stat calls, eliminating the demote/rename ENOENT race while preserving the parsed filesystem snapshot and non-missing errors. Reused workingCopyTaskIdentityRecord in Core's local identity build and removed unused getTaskLoadingMessage. atomic-task-edit: 11 pass; server-init plus cli-init-create: 50 pass. Targeted Biome/diff check pass. A final full tsc invocation is currently blocked only by concurrent server lifecycle API changes expecting Core where FileSystem is passed (src/server/lifecycle.ts and its tests), not owned files.

Final adapter audit: ProjectScope now wraps the Core instance whose FileSystem constructor already froze the canonical storage targets, so scope token validation and request work share one binding with no second Core, mutable directory setters, or post-capture realpath. MCP same-root activation now compares root, backlog, and config targets before reuse, so a changed root config replaces the immutable Core. Added project-selection-binding regression; it and MCP roots pass (9 tests). Server/MCP/scripts contain no stale store/session/retry terminology. Current tsc residual is limited to server-lifecycle.test.ts and server-runtime-scope.test.ts still constructing ProjectScope from FileSystem; test owner must migrate them to Core.

Closed the mutable-binding hole: FileSystem now accepts an initial FileSystemSelection in its constructor; setBacklogDirectory and setConfigLocation are removed. initializeProjectFiles writes through a separately constructed selected filesystem, leaving the supplied Core immutable; consumers must create a fresh Core for the initialized context. Removed Core.listTasksWithMetadata. Existing test call sites requiring migration: server-lifecycle, server-duplicate-repair, server-task-collection-query, server-runtime-scope, server-statistics-endpoint, filesystem-task-cache; listTasksWithMetadata tests are offline-integration and symlink-backlog-root. immutable-project-context, server-init, and cli-init-create: 46 pass; targeted Biome/diff check and owned TypeScript diagnostics pass.

MCP operation freshness audit: changed tool registrations to instantiate handlers from one fresh Core captured through McpServer.createOperationCore() per invocation, rather than retain server.application. Scope tokens now include canonical config target; a config-symlink retarget regression rejects the prior token. Focused project-selection/MCP-roots tests: 10 pass; touched-file Biome, diff check, and build pass. server-runtime-scope's external config-create assertion passes, but its first legacy test fails before assertion because FileSystem.setConfigLocation was removed. Full tsc is blocked by delegated legacy FileSystem setter tests plus an unrelated document-type fixture mismatch.

CLI board export now loads one immutable task snapshot, rejects every contested identity via the canonical ambiguity error before resolving README/output destinations, and exports the snapshot task view only after validation. Verified cli-doctor, CLI board export, board helper, and CLI guidance tests (75 passing total); targeted Biome and diff check pass.

Fixed getTask TaskReadOptions: PersistentTaskRead.get now receives explicit forMutation/includeCrossBranch options, and Core getTask/loadTaskById route through that one reader. Removed freezeResolution target overrides; immutable selection is constructor-only. Expanded immutable-project-context with a local-only getTask regression that throws if branch discovery is attempted and proves a branch-only ID is not read. Regression: 2 pass, 6 assertions; targeted Biome and owned diagnostics pass.

User-approved override: BrowserServices retains a selected scoped ProjectTaskGraph prepared at startup; the previous no-server-retained-state direction does not apply to BACK-709.

Added ProjectTaskGraph for startup-owned snapshots. It shares one canonical record index, readiness graph, and forward/reverse dependency adjacency; update replaces preparation in O(records + relationships) so ambiguity stays coherent. Legacy task-detail/readiness wrappers now reuse the same graph preparation. Focused project-task-graph test passes (1 test, 9 assertions).

Integrated startup-owned ProjectTaskGraph server state. BrowserServices now installs watchers before building and atomically publishes the selected immutable Core/scope/graph; rebuild requests coalesce and scope replacements reject stale requests. Task collection filters prepared TaskListItems with shared Core validation, and detail derives relationships from the prepared graph while reading the task body persistently. Successful resource mutations reconcile before their scoped notification; focused lifecycle, collection, detail, init, reorder, and move endpoint tests pass.

Corrected ProjectTaskGraph preparation: cross-branch tasks use completed records selected by identityIndex.getTasks(true), while activeTasks use only local active/completed records. Removed unused update() API; runtime must replace the graph on snapshot events. Fixed readonly dependency traversal type. Focused graph (2/10) and readiness agreement (5/48) tests plus tsc pass. In-memory benchmark: 1,000 tasks 11.0ms/~0 MiB; 10,000 tasks 66.7ms/~16.5 MiB heap delta.

Lifecycle follow-up: staged config Core/scope/watcher replacements before graph loading and retain the pending selection through coalesced events; root watchers now only react to config, active backlog, or Git paths. Initialization propagates graph-load failure and emits loaded only after publication; disposal suppresses in-flight publication. Removed the API no-op notification callback: successful mutations reconcile centrally before publication, while partial mutation states explicitly reconcile before their error response. Focused lifecycle (9), collection (5), detail (5), init (5), and reorder-publication (2) tests pass; full tsc and targeted Biome/diff checks pass.

TUI readiness follow-up: TaskViewerSession now rebuilds one ProjectTaskGraph on initial and replacement corpora, filters prepared isReady rows, and reuses that graph for detail readiness/dependencies. Removed unreferenced Core.queryTaskSummaries. Focused task-viewer model tests pass (3); interactive ready PTY test is skipped unless RUN_INTERACTIVE_TUI_TESTS=1; targeted Biome and diff check pass.

Runtime profiling update: startup preparation of a 10,000-task graph measured 67 ms and 16.5 MiB heap delta in memory. Isolated runtime run covered 325 test files with a 29 s hard cutoff and at most 3 workers: 316 passed, 7 failed, 2 timed out. The seven original failures were corrected; reruns show cli-init 19.36 s (40 passing) and composer 29.84 s (74 passing). The only original residuals are two timeouts. The malformed server lifecycle configuration fail-closed patch remains in progress, so this task stays In Progress. Full structured report: /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-test-runtime-profile-20260930T131824Z/report.json.

Final integration: awaitNextTasksPublication now accepts Promise<unknown>, awaits the callback result without using it, and preserves its publication assertions. Final verification: bunx tsc --noEmit passed; bunx biome check src/test/server-search-endpoint.test.ts passed; bun test --timeout=10000 src/test/server-search-endpoint.test.ts passed (28 pass, 0 fail, 202 assertions, 17.35s; hard 30s command cap). Previously recorded evidence covers lifecycle 11 pass/2.44s, SPA 29 pass/19.31s, search 15.35s, stats 2.29s, graph 2 pass; the original 325-file isolated profile had 316 pass, 7 failures fixed individually, and 2 timeouts; cli-init rerun 40 pass/19.36s and composer rerun 74 pass/29.84s. bun run check ., bun run build, and git diff --check were already passing; no whole-suite-green claim is made.

Final server review: native Elysia status responses expose their code on ElysiaCustomStatusResponse while set.status remains 200. onAfterHandle now skips 400/409 status responses without serializing them. Query fields use Elysia transforms for repeated/comma-separated normalization; aliases remain intact. Verified: bun test --timeout=10000 src/test/server-api-lifecycle.test.ts src/test/server-task-collection-query.test.ts src/test/server-runtime-scope.test.ts src/test/server-lifecycle.test.ts (20 pass, 49 assertions, 5.18s); bunx tsc --noEmit; targeted Biome and diff check. Isolated malformed watcher recovery passes; no change needed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed native Elysia mutation reconciliation status handling and schema-level task collection query coercion. Focused server tests, TypeScript, Biome, and diff checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
