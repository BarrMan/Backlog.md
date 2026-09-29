---
id: BACK-708
title: Refactor repository quality and shared interaction configuration
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-29 04:11'
updated_date: '2026-09-29 12:48'
labels: []
dependencies: []
ordinal: 342000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User requests Fallow installation and complete findings cleanup, whole-repository SOLID architecture review and refactoring, reusable named constants, and centralized keyboard mappings after the Workspace checkpoint. Terminal behavior remains unresolved and must not be claimed fixed by static cleanup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Fallow is installed and all reported findings are resolved or individually explained with evidence
- [x] #2 Architecture review covers repository subsystems and verified refactors address concrete responsibility and dependency problems
- [x] #3 Reusable policy values have shared named owners
- [x] #4 Keyboard handlers and displayed shortcuts consume centralized keymapping configuration
- [x] #5 Type checking, lint, build and relevant regression tests pass
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reopen remaining analyzer findings for concrete code reduction rather than additional justification. 2. Refactor remaining duplication and high-complexity production ownership in exclusive parallel slices, preserving public behavior and unchanged analyzer thresholds. 3. Verify each slice with bounded regression tests and integrate with type checking, lint, build, and a fresh Fallow scan. 4. Keep task open while remaining findings need implementation; record exact reductions and blockers.

5. Extract moveTasksToStatus immutable planning records from per-task execution, preserving validation, locking, rollback, metadata, and notifications; verify focused Core/board regressions.

Continue after committed checkpoint: use exclusive parallel slices for modal action transactions, navigation composition, Core ordered-move planning/snapshot policy, and markdown serialization. Prefer cohesive behavioral owners over moving branches just to lower a score. Preserve zero duplication and enabled dead-code findings, verify each slice with bounded tests, then integrate and commit the verified follow-up.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Browser/server slice: centralized five browser-global shortcut actions and the search hint in src/web/lib/keyboard-shortcuts.ts; preserved input-owned keys and accessibility activation. Added shortcut tests and consolidated server WebSocket publication plus server timing/port policy constants. Focused tests pass. Scoped Biome checks pass. Full TypeScript and repository Biome checks remain blocked by concurrent unrelated changes outside this slice.

Backend review/refactor: centralized the default status policy through DEFAULT_STATUSES/FALLBACK_STATUS for initialization, migration, and agent-session activation; named statistics retention/display limits; and shared day conversion across Git and statistics. Reviewed agent-workspace, core, file-system, git, markdown, utils, and types hotspots. The workspace UI entry still accepts full Core and uses it broadly, so a narrow UI port would require a UI-owned composition refactor; recommend a future UI task rather than narrowing only AgentSessionService. Focused tests (104) and changed-file Biome pass; build passed. Full Biome and current tsc are blocked by concurrent unrelated files, including .fallowrc.json, server/UI formatting and stale-symbol/type errors in completions, constants, markdown, MCP, UI, and utils.

Installed exact fallow@3.30.0 and added explicit CLI, MCP registry, script, and Bun-test entry points. Removed 56 owned dead exports/declarations; 54 focused MCP/root-discovery tests and the build pass. Full Fallow report is stored outside the repository at /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/fallow-final.json. Remaining repository findings require coordinator allocation; excluded src/ui, src/web, src/core, and src/agent-workspace findings were not edited.

Implemented the TUI keymap defaults and migrated shared help/footer, board/task-list, popup, generic-list, composer, and filter-header bindings. Focused TUI regressions and lint pass. Full tsc remains blocked only by pre-existing unused declarations in src/mcp/validation/tool-wrapper.ts, src/mcp/workflow-guides.ts, and src/utils/find-backlog-root.ts.

Fallow scope audit: added the real browser entry src/web/index.html;  now reports 543 files and 319 entry points, including that HTML entry. Matching fallow-type-aware@3.30.0 is already installed as fallow's optional companion. Fresh reports: /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/latest.json and latest-type-aware.json. Type-aware ran but warned of a stale declaration hash, so it retained conservative syntactic findings; no suppression or code deletion was performed. Exact counts: check.total_issues=134 (including 73 private_type_leaks), health.findings=401 in a separate report field, dupes.clone_groups=109. No unused value exports remain; unresolved ownership is src/server/search.ts, seven type exports, 33 class members, and unused devDependency install.

Final Fallow refresh after removing unused devDependency install: syntax report has 61 check findings, 402 health findings, and 109 clone groups. Type-aware report has 152 check findings because it separately includes 105 private type leaks; health is also 402 and dupes 109. Its semantic pass completed cleanly and confirmed 14 of 41 candidate class-member references as used, reducing unresolved class members from 34 syntactic to 20 without suppressions. Full latest files remain in the system temp directory named in the prior note.

Constants audit slice: centralized default status names, initialization defaults, lifecycle directory paths, agent handoff states/config filename, and Git commit retry policy. Scoped tests (26) and changed-file Biome pass; full TypeScript remains blocked only by the concurrent browser keyboard-shortcuts type error.

Fallow clone inventory refreshed read-only: current configured scan reports 80 groups (not the earlier 87/109). Recorded all 80 classifications and exact refactor scopes in /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/duplicates-review.md: 51 genuine duplicated policy/algorithm groups and 29 intentional structural similarities. No production files changed.

Checkpoint committed as 436a8ab before refactoring; Workspace terminal report remains unresolved in BACK-707.3. Installed pinned Fallow and semantic companion3.30.0 with accurate CLI/browser/test entrypoints. Integrated Fallow dead-code check is clean; cycles removed. Full pipeline still fails on36 clone groups (1.8% duplication) and389 health findings: ALL-findings request remains incomplete, with no health/duplication baselines or raised thresholds. Refactored CLI init/list/edit, core task update/init/milestones, filesystem config/milestones, session process/worktree boundaries, browser state/data hooks, and shared UI policies. TUI and browser handlers/hints use central keymaps; remapping dispatch tests and accessibility labels added. Defaults centralized with distinct historical fresh/migration/runtime semantics preserved. Timeout correction: no20minute tests; bounded batches replace whole-suite runs. Board readiness and pending-write completion now drive test synchronization; explicit empty argv preserved by test helper. Integrated tsc/Biome/build pass. Bounded regression verification1165pass10skip0fail; final keyboard labels24focusedpass. Full architecture review and remaining findings: /Users/imribarr/docs/Backlog.md/refactoring-review.md. Task remains In Progress until remaining Fallow/architecture findings are resolved or individually justified.

Scoped commands/completions/guidelines/scripts health audit: created command-modules-findings-review.json with 56 exact original path/name/line/col records, metrics, branch ownership, relevant tests, and source-backed dispositions. No production edit was safe or justified in concurrently modified command/wizard modules; existing task-list and task-edit helpers are recorded as resolved boundaries. Focused completion tests: 21 pass; review JSON Biome check passes; exact tuple reconciliation against fallow-continuation.json passes.

Command-module completion: reassessed all 10 formerly unresolved genuine records. Refactored five concrete boundaries: init integration option policy, wizard string-list diff policy, help-schema block-list parsing, selected MCP-client setup, and MCP shutdown registration. Reclassified five as cohesive request/wizard/create/scalar/watch transactions with source-specific rationales. Moved the complete 56-record ledger via apply_patch to /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/command-modules-findings-review.json; no root artifact remains. TypeScript passes; 24 focused command tests pass; direct changed-file Biome check pending.

Verification complete: direct Biome check of the five changed command files passes. The package check wrapper remains blocked only by unrelated concurrent UI formatting in src/test/ui-state-owners.test.ts, src/ui/board.ts, and src/ui/task-viewer-with-search.ts.

Continuation completed source-specific reconciliation: all 385 current health findings and 26 clone fingerprints have individual dispositions in /Users/imribarr/docs/Backlog.md/refactoring-findings.json, with methodology and architecture map in /Users/imribarr/docs/Backlog.md/refactoring-review.md. Confirmed responsibility/duplication problems were refactored, including query/editor flows, CLI filter parsing, modal lifecycle/keyboard/list policies, board transitions, viewer selection generations, serialization section updates, and shared milestone aliases. Local task-search regression introduced during refactoring was caught and fixed with Core and CLI coverage. Final enabled Fallow check categories report zero issues; duplication is 1.3%. IMPORTANT: check:fallow -- --summary still exits 1 on unchanged health/duplication gates (385 findings, 26 clone groups); acceptance criterion 1 is met by individual source-backed explanations, not zero warnings, raised thresholds, or suppressions. Private-type-leak remains disabled and is not a verified clean category. Final integrated TypeScript, repository Biome, and build pass. Bounded integration tests: 557 pass, 1 skip; subsequent parser verification: 28 pass. No full-suite clean-run claim. BACK-707.3 terminal report remains unresolved. Refactoring changes remain uncommitted.

Implemented remaining duplication rather than accepting review explanations: fresh integrated Fallow reports zero clone groups (previously 26) and zero enabled dead-code issues. Added shared document lifecycle/rendering, typed config policies, task/draft creation reporting, search/doctor command responsibilities, scalar mutation rules, serialization frontmatter policies, CLI/session subprocess capture, TUI popup/lifecycle/navigation policies, and generation-scoped optimistic modal updates. Modal rendering split into content and metadata owners; cognitive/cyclomatic improved from 145/119 to 75/51. Workspace key handling cognitive 50 to 17. Bulk move orchestration 37/68 cyclomatic/cognitive to 5/4; its ordered planner still reports 24/35. SideNavigation 49/70 to 20/42. Remaining health findings: 396 total, comprising 161 structural threshold findings and 235 estimated-CRAP-only findings. Total is higher than the 385 baseline because new smaller helpers receive separate estimated-coverage scores; do not claim all health work finished. No thresholds/baselines/suppressions changed. Final tsc, repository Biome, and build pass. Bounded backend/CLI integration: 349 pass; all nine modal suites: 65 pass; targeted UI/Workspace/document/server checks pass. Browser integration exposed an accidentally removed isTerminalStatus import after extraction; restored it and reran affected suites successfully. Current report: /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/fallow-remaining-final-verified.json. Updated /Users/imribarr/docs/Backlog.md/refactoring-review.md and explicitly marked the prior disposition ledger historical. Keep In Progress for remaining complexity implementation; original Workspace terminal report remains separate and unresolved. No new commits.

Committed verified refactoring checkpoint as 94f5b70. Continuing remaining structural complexity reductions with parallel agents; coordinator owns integration and assists difficult cases.

Parallel follow-up after checkpoint: introduced modal action owner with lifecycle epochs, sidebar section shell, ordered-move planner, and typed ordered serialization policies. Coordinator review directed fixes for same-task reopen/unmount/refresh races and removed arbitrary microtask timing yields. Core query freshness previously compared live backlogDir getters on the same FileSystem; immutable read context now covers query/get/subtasks, and local queries recheck after asynchronous milestone filtering. Added deferred regression for that second race. Final integrated analyzer: zero enabled dead-code issues, zero clone groups, 393 health findings (156 structural, 237 estimated-CRAP-only), down from 396 total/161 structural at checkpoint. Serializer has zero health findings; ordered planner maximum13 cyclomatic/12 cognitive from24/35; snapshot attempt17/11 from24/18; modal46/67 from51/75; sidebar16/39 from20/42. Final tsc/Biome/build pass. Bounded verification: Core/Board/search87pass, serialization81pass, sidebar4pass; modal/deeplink99pass followed by changed-suite23pass including one added save-ABA regression (100 distinct modal/deeplink cases). Fresh report /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/back-708-post-checkpoint-final.json. Durable external review updated. Keep In Progress: remaining health findings unresolved; no threshold/suppression changes.
<!-- SECTION:NOTES:END -->
