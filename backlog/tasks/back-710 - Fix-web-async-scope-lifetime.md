---
task_schema_version: 2
id: BACK-710
title: Fix web async scope lifetime
status: Done
assignee:
  - '@gpt-5.6-terra'
created_date: '2026-09-30 12:39'
updated_date: '2026-09-30 12:42'
labels: []
dependencies: []
type: bug
ordinal: 344000
description: >-
  A mounted web project can be unmounted or superseded while data and socket
  setup requests are pending. Their continuations presently call React state
  setters or browser APIs after test cleanup, causing cross-realm Event failures
  and fetch errors outside the owning test/project context.
implementation_plan: >-
  1. Add mounted-scope invalidation to app-data loads and refreshes so pending
  work cannot publish after disposal. 2. Make socket setup and callback lifetime
  cleanup explicit without changing shared scoped connection or initial
  synchronization. 3. Dispatch browser events from the active window realm and
  add a pending-lifetime web regression. 4. Run targeted and full web
  verification.
implementation_notes: >-
  Added mounted scope invalidation for app-data requests, realm-correct event
  dispatch, socket callback/retry teardown, and lifecycle request cancellation.
  Verified: bun test --timeout=10000 src/test/web-scoped-websocket.test.tsx (3
  pass); bun test --timeout=10000 src/test/web-*.test.tsx (297 pass across 37
  files); bunx biome check on the four changed files passed. bunx tsc --noEmit
  remains blocked by unrelated concurrent API/type changes in core tests; full
  bun run check . reports pre-existing formatting issues outside this task.
final_summary: >-
  Disposed web scopes now discard pending data, lifecycle, and socket
  continuations; scoped socket first-open synchronization remains intact. Added
  unmount/replacement-window regression coverage and verified targeted plus full
  web tests.
acceptance_criteria:
  - index: 1
    text: >-
      Unmounted or superseded app-data scopes discard pending request and socket
      continuations
    checked: true
  - index: 2
    text: >-
      Socket subscription and reconnect handlers are fully cleaned up on unmount
      while retaining one scoped socket and first-open synchronization
    checked: true
  - index: 3
    text: Web events use the current window realm
    checked: true
  - index: 4
    text: >-
      A targeted regression covers pending unmount or scope transition without
      late async errors
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
