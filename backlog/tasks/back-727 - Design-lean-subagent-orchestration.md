---
task_schema_version: 2
id: BACK-727
title: Find existing Pi subagent orchestration package
status: In Progress
assignee:
  - '@gpt-5.5'
created_date: '2026-10-02 10:26'
updated_date: '2026-10-02 11:47'
labels: []
dependencies: []
ordinal: 361000
description: >-
  Identify and evaluate an already existing Pi package that comes with dedicated
  specialist subagents for orchestration. The desired setup is an orchestrator
  implemented as a specialized agent that knows when and how to use packaged
  specialist subagents (for architecture, clean-code conventions, design
  patterns, SOLID, testing, and framework/library decisions). The goal is not
  merely a subagent orchestration runtime where the user must create all custom
  specialists manually.
implementation_notes: >-
  Refined requirement: user wants packages that ship dedicated specialist
  subagents/roles, not just a subagent runtime requiring custom agents.
  Confirmed by npm tarball inspection: gentle-pi ships
  assets/agents/gentle-ai-explore.md, gentle-ai-verify.md, gentle-ai-worker.md,
  jd-fix-agent.md, jd-judge-a.md, jd-judge-b.md, review-readability.md,
  review-reliability.md, review-resilience.md, review-risk.md plus orchestrator
  skill material; it is the closest Pi gallery/npm package found but does not
  obviously include exact architecture/SOLID/design-pattern/framework-decision
  specialists. @d3ara1n/pi-subagent ships built-in roles explorer, reviewer,
  worker, researcher; useful but generic and not the requested dedicated
  discipline specialists. @akagilnc/pi-workflow-roles ships many
  workflow/governance roles (auditor, collector, countersign, diarist, doctor,
  gatekeeper, inspector, judge, merger, navigator, notary, reviewer,
  secretariat, worker, etc.) but they appear workflow/governance roles rather
  than coding-discipline specialists. New user-provided candidates reviewed:
  msitarzewski/agency-agents is the strongest fit for the desired packaged
  specialist roster. It is not currently on pi.dev
  (https://pi.dev/packages/agency-agents returns 404) and no Pi integration was
  found, but it ships an Agents Orchestrator plus many dedicated
  engineering/testing/design/security agents, including
  engineering-software-architect, engineering-code-reviewer,
  engineering-senior-developer, engineering-backend-architect,
  engineering-minimal-change-engineer,
  engineering-multi-agent-systems-architect, testing-test-automation-engineer,
  testing-api-tester, testing-reality-checker, testing-evidence-collector,
  security-architect, security-appsec-engineer, etc. Superpowers
  (obra/Superpowers) is a native Pi-installable git package (README: pi install
  git:github.com/obra/superpowers) but not on pi.dev gallery; it provides
  skills/methodology for spec, planning, TDD, subagent-driven-development,
  implementer/reviewer prompts, and a senior code reviewer skill. It supports Pi
  and pairs with pi-subagents, but it is not primarily a packaged roster of
  dedicated architecture/SOLID/framework specialist subagents. Current
  recommendation direction: if strict Pi package/native install matters,
  Superpowers is usable in Pi but not the desired specialist roster; if the
  requirement is the best prebuilt specialist-agent collection, agency-agents is
  the closest match, with caveat that Pi adaptation/install may be needed.
acceptance_criteria:
  - index: 1
    text: >-
      Identifies existing Pi package candidates that include dedicated
      specialist subagents, not just an orchestration runtime
    checked: false
  - index: 2
    text: >-
      For each candidate, records package name, pi.dev URL, what subagents/roles
      it ships with, and fit for the orchestrator-agent goal
    checked: false
  - index: 3
    text: Recommends the best-fit package or concludes no suitable package was found
    checked: false
  - index: 4
    text: >-
      Documents installation and basic usage workflow for the recommended
      package if one exists
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
