---
task_schema_version: 2
id: BACK-715
title: Bring the full product test suite under 30 seconds
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-09-30 14:52'
updated_date: '2026-09-30 19:08'
labels: []
dependencies:
  - BACK-712
type: chore
ordinal: 349000
description: >-
  The product needs a single full-suite runtime objective, distinct from
  BACK-711’s completed per-file profiling baseline and BACK-713’s server-subset
  profile. Remove test-suite bottlenecks without weakening behavioral coverage.
implementation_plan: >-
  1. Measure complete isolated suite execution with preserved coverage. 2. Use a
  shared compiled CLI executable and direct command-array fixture invocations to
  eliminate repeated source loading while preserving embedded assets and
  starter-process lifetime. 3. Improve runner scheduling, incremental failure
  reporting and cancellation cleanup. 4. Profile remaining real Git and composer
  integration costs; require a complete passing measured run at or below 30
  seconds before completion.


  5. Make the Git timeout process-group test deterministic by waiting for its
  real child readiness and invoking only the captured Git deadline callback.


  6. Capture only this statistics test's watcher event directories and paths
  plus reconciliation outcome on the 4-second branch-ref publication timeout;
  reproduce under bounded filesystem churn before changing production filtering.
implementation_notes: >-
  Replaced the 29-second round-robin runner with six cost-balanced isolated
  lanes, a strict 30-second all-workload deadline, process-group cancellation,
  and completed/pending file reporting. The runner now builds one shared CLI
  bundle before tests so CLI integration subprocesses do not repeatedly parse
  TypeScript; current bundle build correctly fails on the concurrent server
  refactor's missing TaskCollectionFilterError export.


  Latest platform run with the compiled shared CLI fixture completed 15/40 files
  before the strict deadline; wall time was 31.42 seconds including compilation
  and cleanup, and it failed rather than masking the 25 pending files. The
  isolated cli-init-create lane remains a primary bottleneck and will be
  investigated separately from concurrent server work.


  Measured isolated baseline: cli-init-create.test.ts passes 40/40 in 22.44
  seconds on source CLI; compiled-fixture runner invocation remains 1/1 in 22.85
  seconds because 34 legacy Bun-shell invocations still launch the wrapper. A
  representative runTestCli fixture file passes 1/1 in 4.84 seconds including
  binary compilation. Full-platform latest remains a failed 15/40 completion at
  31.42 seconds, not a passing sub-30 claim.


  Clean documented full-suite measurement after server reconciliation: bun run
  test failed closed at 30.15 seconds with 0/327 completed and 327 pending;
  outer /usr/bin/time wall was 30.93 seconds. Seven concurrently launched batch
  lanes all remained incomplete (29.26 seconds each), so the current lane
  grouping cannot satisfy the objective and no result was marked passing.


  Reworked scripts/run-ci-tests.ts to use six per-file isolated worker slots,
  cumulative completed file/test progress, optional BACKLOG_TEST_DEADLINE_MS
  diagnostic cancellation, and BACKLOG_TEST_REPORT JSON diagnostics. Removed the
  Perl process launcher and replaced native compilation with a shared Bun
  bundle. Focused cli-init-create measurement: 40/40 tests passed in 19.50s
  outer wall (runner 19.25s; bundle 0.78s), improving the prior compiled-fixture
  22.85s baseline but still too slow to support an honest 30s full-suite claim.
  Type-check and runner lint pass; a one-test name-filter invocation passes in
  1.17s. Full-suite execution intentionally deferred to a contention-free
  coordinator run.


  Current targeted measurements (before the concurrent source move made CLI
  bundling unavailable): `bun scripts/run-ci-tests.ts
  src/test/cli-init-create.test.ts --timeout=10000` built the shared Bun bundle
  in 0.77s, passed 40/40 in 18.17s, and completed in 18.95s. A single matching
  CLI test completed in 1.88s total (0.70s test execution after a 1.18s bundle),
  confirming the remaining cli-init-create cost is repeated real CLI subprocess
  work rather than an arbitrary fixture wait.


  Composer capped diagnostic: `BACKLOG_TEST_DEADLINE_MS=25000 ...
  tui-task-composer.test.ts` built in 0.80s but completed 0 tests before
  cancellation at 25.01s; no valid per-test timing can be inferred under current
  contention.


  A compiled-executable runner experiment was reverted: the current concurrent
  source relocation has unresolved imports in `src/cli/register.ts`
  (config-command-actions and init), so the normal shared bundle cannot build.
  `bunx tsc --noEmit` is blocked by those same unrelated relocation/persistence
  errors. Targeted Biome for runner and CLI fixture files passes. No production
  or test-runner code changes remain. Defer a clean `bun run test` to the
  coordinator after the worktree reconciles; do not treat any capped
  cancellation as success.


  Runner now prioritizes 14 files measured as longest in the supplied isolated
  platform log (LPT scheduling) while retaining one Bun process per file.
  Failed-file output is emitted immediately on worker completion; SIGINT/SIGTERM
  now cancel active process groups and retain the normal cancellation
  summary/report path. Evidence: scoped test-utils runner pass 3/3 in 1.88s;
  deadline-at-10ms run wrote a JSON report with 0/1 completed and the pending
  composer file. Composer focused run executed 74 tests in 46.68s (canonical
  persistence subset 20 tests in 29.99s); five current assertion failures are
  from concurrent frontmatter/UI changes, not a test hang. Biome passes.
  Typecheck has only concurrent failures in definition-of-done,
  section-marker-safety, and server-task-collection-query.


  Replaced the disk-only shared CLI output with the production-style Bun
  compiled artifact plus a temporary Bun launcher, so existing `bun <cli-path>`
  test calls execute the compiled CLI and its browser assets remain embedded
  from arbitrary fixture working directories. Verified: `bun
  scripts/run-ci-tests.ts src/test/cli-browser-port.test.ts --timeout=10000`
  passed 2/2 (runner 4.38s, compilation 2.27s); `bun test --timeout=10000
  src/test/list-window.test.ts` passed 8/8 and exits 0 after restoring an
  initially unset exit code to 0; focused Biome passes. `bunx tsc --noEmit`
  remains blocked by unrelated concurrent errors in
  `src/test/config-watcher.test.ts`.


  Owned fixture review: composer already uses one initialized real Git template
  copied per test, preserving isolated worktrees, indexes, hooks, signing, and
  race coverage. Scoped direct baseline: bun test v1.3.10 (30e609e0) passed
  74/74 in 34.09s wall. Copy-on-write snapshot experiment () passed 74/74 but
  took 39.90s, so it was reverted. Final unchanged scoped run passed 74/74 in
  35.36s. cli-init-create already reuses its initialized create fixture; its
  remaining time is intentional shipped-CLI subprocess coverage. No owned source
  change retained and no full suite was run under parallel contention.


  Correction to the preceding fixture-review note: the copy-on-write experiment
  used the Node fs constant COPYFILE_FICLONE. Its scoped result was 74/74 passed
  in 39.90s; it was reverted. The accidental command substitution also ran one
  extra unchanged scoped composer test, which passed 74/74 in 33.39s. No source
  changes are retained from this review.


  Removed the temporary Bun launcher around the shared compiled CLI artifact.
  Runner fixtures now receive the executable itself; JSON watch and browser-port
  direct subprocesses use the command array so no extra parent outlives a killed
  starter. Verified runner selections: cli-json-watch 8/8 in 14.24s and
  cli-browser-port 2/2 in 4.15s. Targeted Biome passes. The broad check remains
  blocked only by concurrent formatting/import changes in
  src/file-system/content-repository.ts and src/file-system/operations.ts.


  Renamed the runner fixture environment to BACKLOG_TEST_CLI_BINARY and made the
  shared command array execute the compiled binary directly. Converted direct
  Bun/Node spawns, JSON watch launcher construction, shell-quoted agent-session
  script, CLI pipe output, plain output, and init-without-Git fixtures.
  Requested runner sample passed 55/55 in 17.06s (bundle 0.99s); targeted Biome
  passed.


  Integrated measurement: all 334 files completed, 2871 passing tests, 2 failed
  fixture files, 212.12s external wall time (211.74s runner). Those two fixtures
  subsequently passed. A later full run was interrupted at the 560s tool limit
  with large timing discontinuities; it is not passing evidence. Latest targeted
  6-file integration: 48/48 tests in 4.44s including shared binary build.
  Full-suite <=30s acceptance remains unmet; no performance-related test skips
  or integration mocks were added.


  Added failure-only diagnostics to server-statistics-endpoint: the branch-ref
  test captures BrowserServices watcher directory/path callbacks and each
  callback's reconciliation outcome, appending them only if its 4-second
  publication wait times out. Focused run under unrelated temp-root FSEvents
  churn passed 5/5 in 2.67s, so no event path/root cause was observed and no
  production Git filter change or regression was added.


  Latest complete default four-worker run: 334/334 files finished, 2875 passing
  tests, one failed file (server-statistics-endpoint.test.ts, branch-ref tasks
  publication timeout), 201.77s external wall time. No pending/timed-out files
  and no performance-driven skips. Targeted four-suite contention runs passed
  but full-run branch publication failure remains unresolved; added failure-only
  path/reconciliation diagnostics. Final static checks pass. Final scoped 8-file
  integration passes83 tests in4.14s; Git process suite passes23. Shared
  compiled CLI and all command-array callsites are integrated; default4workers
  selected after measured reduced contention. BACK-715 remains In Progress:
  neither clean whole-suite success nor <=30s is satisfied.
acceptance_criteria:
  - index: 1
    text: >-
      The complete product test command passes with no failed,
      skipped-for-performance, or timed-out test files
    checked: false
  - index: 2
    text: >-
      A clean full-suite invocation completes in 30 seconds or less under the
      documented project test command
    checked: false
  - index: 3
    text: >-
      Performance changes preserve relevant behavioral coverage and record the
      measured full-suite duration
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
