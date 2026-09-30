---
id: BACK-715
title: Bring the full product test suite under 30 seconds
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-09-30 14:52'
updated_date: '2026-09-30 15:30'
labels: []
dependencies:
  - BACK-712
type: chore
ordinal: 349000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The product needs a single full-suite runtime objective, distinct from BACK-711’s completed per-file profiling baseline and BACK-713’s server-subset profile. Remove test-suite bottlenecks without weakening behavioral coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The complete product test command passes with no failed, skipped-for-performance, or timed-out test files
- [ ] #2 A clean full-suite invocation completes in 30 seconds or less under the documented project test command
- [ ] #3 Performance changes preserve relevant behavioral coverage and record the measured full-suite duration
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use Bun's default test naming patterns to discover test and spec files, preserving forwarded test arguments and CI profiles. 2. Run each file in an isolated worker slot so completed files and parsed test counts are reported as they finish, without treating a deadline as normal runner behavior. 3. Measure the shared CLI artifact and a focused direct-CLI slice, then leave the contention-free capped full-suite command for the final coordinator run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the 29-second round-robin runner with six cost-balanced isolated lanes, a strict 30-second all-workload deadline, process-group cancellation, and completed/pending file reporting. The runner now builds one shared CLI bundle before tests so CLI integration subprocesses do not repeatedly parse TypeScript; current bundle build correctly fails on the concurrent server refactor's missing TaskCollectionFilterError export.

Latest platform run with the compiled shared CLI fixture completed 15/40 files before the strict deadline; wall time was 31.42 seconds including compilation and cleanup, and it failed rather than masking the 25 pending files. The isolated cli-init-create lane remains a primary bottleneck and will be investigated separately from concurrent server work.

Measured isolated baseline: cli-init-create.test.ts passes 40/40 in 22.44 seconds on source CLI; compiled-fixture runner invocation remains 1/1 in 22.85 seconds because 34 legacy Bun-shell invocations still launch the wrapper. A representative runTestCli fixture file passes 1/1 in 4.84 seconds including binary compilation. Full-platform latest remains a failed 15/40 completion at 31.42 seconds, not a passing sub-30 claim.

Clean documented full-suite measurement after server reconciliation: bun run test failed closed at 30.15 seconds with 0/327 completed and 327 pending; outer /usr/bin/time wall was 30.93 seconds. Seven concurrently launched batch lanes all remained incomplete (29.26 seconds each), so the current lane grouping cannot satisfy the objective and no result was marked passing.

Reworked scripts/run-ci-tests.ts to use six per-file isolated worker slots, cumulative completed file/test progress, optional BACKLOG_TEST_DEADLINE_MS diagnostic cancellation, and BACKLOG_TEST_REPORT JSON diagnostics. Removed the Perl process launcher and replaced native compilation with a shared Bun bundle. Focused cli-init-create measurement: 40/40 tests passed in 19.50s outer wall (runner 19.25s; bundle 0.78s), improving the prior compiled-fixture 22.85s baseline but still too slow to support an honest 30s full-suite claim. Type-check and runner lint pass; a one-test name-filter invocation passes in 1.17s. Full-suite execution intentionally deferred to a contention-free coordinator run.
<!-- SECTION:NOTES:END -->
