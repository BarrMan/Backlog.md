---
task_schema_version: 2
id: BACK-519
title: >-
  Rework README into a landing page centered on the review-surface value
  proposition
status: Done
assignee:
  - '@fable'
created_date: '2026-07-04 05:48'
updated_date: '2026-07-04 13:01'
labels:
  - docs
dependencies: []
priority: medium
ordinal: 114000
description: >-
  The backlog.md domain points to this README, so it effectively is the product
  landing page. Today it opens with a generic feature list and buries the core
  pitch. Per Alex's current framing, the durable value proposition is: agents
  produce more work than humans can read, and Backlog.md is the tool that makes
  that work reviewable before execution (tasks/AC/milestones as review
  checkpoints) and legible after (task history as a ledger of intent). Rework
  the README to lead with that story, add landing-page elements (badges, social
  proof, talk videos), and tighten the structure without losing reference
  content.
implementation_plan: >-
  1. Draft reworked README: hero (logo, badges, tagline, install, GIF), inverted
  pitch (agents outproduce review bandwidth; Backlog.md = review surface before
  + ledger after), compact 'stay in control' loop with 3 review checkpoints
  linking to existing workflow steps

  2. Add shields.io badges: npm version, npm downloads, GitHub stars, MIT
  license

  3. Add Talks section with Devoxx Belgium and AI Engineer Code Summit video
  links as social proof

  4. Preserve all reference sections (getting started, AI/manual workflows, web
  UI, MCP, CLI ref, config, community tools, license); verify every mentioned
  command against backlog --help

  5. Run multi-agent critique (landing-page lens, accuracy-vs-shipped-surface
  lens, skeptical-newcomer lens); revise draft

  6. Check ACs, add implementation notes
implementation_notes: >-
  Ran a 6-agent critique/ideation workflow. Accuracy agent verified all
  links/badges/assets/commands against the shipped CLI surface (all 200/exist);
  flagged task-prefix inconsistency (fixed: README now explains BACK- vs TASK-
  prefix) and missing Cursor client guide (fixed: added Cursor entry pointing at
  manual JSON config). Skeptic agent flagged overclaims; applied: dropped 'Proof
  it works: ~99%' in favor of 'Dogfooded' + link to the backlog/tasks ledger,
  reframed 'agents rarely fail' to attention-economics framing, replaced '100%
  private' with 'Local-first (no server/account/telemetry)', removed adjective
  fluff, neutralized the 95% talk headline. Landing-page agent: thesis line
  added to hero, hero install reduced to one command, blockquote deduped against
  Why section, talks surfaced right after Why, features trimmed 13 to 9, config
  section compressed (full detail already in ADVANCED-CONFIG.md), MCP manual
  config collapsed into details, workflow sections promoted to h2. Info moved
  (not lost): --modified-file search and comment-delimiter caveat now in
  CLI-INSTRUCTIONS.md. DoD: no TypeScript touched; markdown-only change, Biome
  does not process md; no tests affected. Left In Progress pending Alex's review
  of the working-tree diff (nothing committed).


  Review feedback from Alex (checkpoint 3): remove all em dashes. Applied across
  README.md by rewriting each occurrence naturally (colons for list leads and
  checkpoint labels, periods or semicolons for sentence breaks, comma splices
  where flow allowed); also replaced the en dash in the License line. Verified
  zero em/en dashes remain via grep. PDF regenerated and redelivered.
final_summary: >-
  Reworked README.md as a landing page: hero with logo/badges/thesis line, 'Why
  Backlog.md in the AI era' section with the 3 review checkpoints and ledger
  framing, dogfooding proof linking to the task ledger, talk videos as social
  proof, trimmed feature list, compressed config/MCP reference sections (details
  preserved in ADVANCED-CONFIG.md / CLI-INSTRUCTIONS.md / collapsible blocks).
  Verified all commands, links, badges, and assets against the shipped surface
  via critique agents.
acceptance_criteria:
  - index: 1
    text: >-
      README opens with a hero: logo/title, one-sentence value prop centered on
      reviewing and steering AI agent work, install one-liner, and demo visual
    checked: true
  - index: 2
    text: 'npm version, downloads, and license badges are present with correct links'
    checked: true
  - index: 3
    text: >-
      A section explains the core loop with the 3 review checkpoints (spec,
      plan, code) and one-task-one-context-window guidance, placed before deep
      reference content
    checked: true
  - index: 4
    text: >-
      At least one talk video (Devoxx or AI Engineer Code Summit) is linked as
      social proof
    checked: true
  - index: 5
    text: >-
      Every command and feature mentioned exists in the shipped CLI/MCP surface
      (no invented behavior)
    checked: true
  - index: 6
    text: >-
      Existing reference sections (MCP setup, configuration, CLI reference,
      community tools, license) are preserved or consolidated without
      information loss
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
