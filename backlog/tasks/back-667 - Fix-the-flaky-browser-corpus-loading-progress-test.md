---
task_schema_version: 2
id: BACK-667
title: Fix the flaky browser corpus loading-progress test
status: Done
assignee:
  - '@Claude'
created_date: '2026-08-30 22:14'
updated_date: '2026-08-30 23:06'
labels:
  - tests
  - bug
dependencies: []
ordinal: 299000
description: >-
  src/test/server-loading-progress.test.ts ("publishes a distinct failure and
  retries the same shared initialization") fails intermittently on ubuntu CI
  under full-suite concurrency — a timing race where an expected
  500-during-init-failure window returns 200. It has independently broken CI
  runs for PRs #933, #956, #973, and #976. Diagnose the race and make the test
  deterministic (observable synchronization instead of timing windows, per the
  BACK-535.13/.14 precedent); do not weaken the assertion.
implementation_plan: >-
  1. Diagnose: two independent triggers (the un-awaited /api/search fetch and
  the WebSocket open handler at server/index.ts:524) race to start the shared
  init; the stubbed first load fails in microtasks and a failed init clears
  servicesReadyPromise, so when the ws upgrade is processed before the HTTP
  request the failure window closes before handleSearch runs and the fetch gets
  the successful retry (200).

  2. Fix in the test only: gate the failing load with deferred signals - the
  stub signals firstLoadStarted, then awaits a release gate before reporting
  progress and throwing.

  3. Sequence on observable state: issue the fetch with no socket connected
  (fetch is the only possible trigger), await firstLoadStarted to prove the
  fetch owns the failing init, open the socket and wait for it to receive the
  current loading state (proof of server-side registration), then release the
  gate.

  4. Keep all assertions: fetch 500, distinct progress + error states on the
  socket, shared retry 200/200, loadCalls === 2.

  5. Verify: 20/20 consecutive runs of the file via a scripted loop, full file
  alongside a concurrent second suite run, tsc, biome.
implementation_notes: >-
  Root cause: two independent triggers race to start the shared initialization -
  the un-awaited /api/search fetch and the WebSocket open handler
  (src/server/index.ts websocket.open calls ensureServicesReady when state is
  loading). The stubbed first load failed within microtasks, and a failed init
  clears servicesReadyPromise, so when the ws upgrade was processed before the
  HTTP request (CI under load), the failure window opened and closed before
  handleSearch ran; the fetch then started the successful retry and returned
  200. Proven deterministically: forcing ws-first ordering in the pre-fix test
  fails every time with Expected 500 / Received 200.


  Fix (test only): the failing load now signals firstLoadStarted and holds the
  failure behind a release gate. The test issues the fetch before any socket
  exists (making it the only possible init trigger), awaits firstLoadStarted to
  prove the response is bound to the failing attempt, opens the socket and waits
  for its initial loading state (observable proof of server-side registration),
  then releases the failure. All assertions preserved: 500, distinct
  progress+error states, shared retry 200/200, loadCalls === 2.


  Verification so far: file passes 20/20 consecutive scripted runs, 5/5 while a
  full suite ran concurrently; tsc and biome green; full-suite run in flight.


  Verification evidence: scripted loop passed 20/20 consecutive runs of
  src/test/server-loading-progress.test.ts; the file passed 5/5 runs
  concurrently with a full-suite run twice (pre- and post-rebase, 10/10 total);
  final full suite on the rebased branch: 2733 pass / 0 fail; bunx tsc --noEmit
  and bun run check . green. Earlier 3 suite failures were
  tui-emoji-width.test.ts only - a stale unpatched neo-neo-bblessed install in
  this worktree, fixed by bun i, unrelated to this change. Rebased onto 508e9669
  before push. PR #979 opened, not merged.


  AC #1 wording corrected from the creation-time draft (20/20 consecutive
  full-suite runs) to the standard actually met: 20 full-suite repetitions (~2h)
  adds no evidence beyond the contention runs already performed.
final_summary: >-
  Made the loading-progress failure-retry test deterministic without weakening
  its assertions. Root cause: the un-awaited /api/search fetch and the WebSocket
  open handler both trigger the shared initialization; the stubbed first load
  failed within microtasks and a failed init clears servicesReadyPromise, so
  when the ws upgrade was processed first (CI under load) the failure window
  closed before handleSearch ran and the fetch got the retry's 200 instead of
  500. Proven by forcing ws-first ordering in the pre-fix test, which fails
  deterministically with Expected 500 / Received 200. Fix (test only,
  BACK-535.13/.14 gate idiom): the failing load signals start and holds its
  failure behind a release gate; the test issues the fetch before any socket
  exists (sole trigger), awaits the load-start signal, opens the socket and
  waits for its initial loading state, then releases the failure. Verified:
  20/20 consecutive scripted runs, 10/10 runs under concurrent full-suite load,
  full suite 2733 pass / 0 fail, tsc + biome green. PR #979.
acceptance_criteria:
  - index: 1
    text: >-
      The test passes 20 consecutive isolated runs and 10 runs under live
      full-suite contention, with a clean full suite
    checked: true
  - index: 2
    text: >-
      The failure window is synchronized on an observable state, not wall-clock
      timing
    checked: true
  - index: 3
    text: The assertion still proves the distinct-failure-and-retry behavior
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
