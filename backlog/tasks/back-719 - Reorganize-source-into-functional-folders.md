---
id: BACK-719
title: Reorganize source into functional folders
status: To Do
assignee: []
created_date: '2026-09-30 16:26'
labels: []
dependencies: []
type: chore
ordinal: 353000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repository structure contains singleton directories and forwarding shells that obscure functional ownership. Reorganize source by feature or functional responsibility so modules live with the behavior they own and imports are direct.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Source folders group modules by functional responsibility rather than singleton directory names
- [ ] #2 Singleton directories without a clear functional boundary are eliminated
- [ ] #3 Forwarding shell modules are removed and consumers import the owning implementation directly
- [ ] #4 Type checking, formatting, and affected tests pass
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
