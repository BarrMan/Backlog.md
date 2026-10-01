---
task_schema_version: 2
id: BACK-86
title: Update agent guidelines to emphasize outcome-focused acceptance criteria
status: Done
assignee: []
created_date: '2025-06-18'
updated_date: '2025-06-21'
labels:
  - documentation
  - agents
dependencies: []
description: >-
  The current agent instruction files (CLAUDE.md, AGENTS.md, .cursorrules) need
  clearer guidance on writing proper acceptance criteria. AI agents should be
  instructed to write acceptance criteria that focus on outcomes, behaviors, and
  requirements rather than implementation steps. This will help distinguish
  between acceptance criteria (what must be achieved) and implementation plans
  (how to achieve it).
implementation_plan: |-
  1. **Review Current Guidelines**
     - Audit existing agent instruction files for acceptance criteria guidance
     - Identify gaps or unclear instructions about acceptance criteria

  2. **Define Standards**
     - Create clear definition of acceptance criteria vs implementation plans
     - Develop examples of good and bad acceptance criteria
     - Define when implementation plans should be added

  3. **Update Documentation**
     - Add acceptance criteria guidelines to CLAUDE.md
     - Update AGENTS.md with examples and best practices
     - Enhance .cursorrules with specific instructions for AI agents
     - Include templates or examples for reference

  4. **Quality Assurance**
     - Review updated guidelines for clarity and completeness
     - Ensure consistency across all agent instruction files
implementation_notes: >-
  ### Files Modified


  - **CLAUDE.md**: Added comprehensive "Writing Effective Acceptance Criteria"
  section (lines 70-88) with clear principles, examples, and distinction between
  ACs and implementation plans

  - **AGENTS.md**: Enhanced section 4 with good vs bad examples and clear
  guidance on outcome-focused criteria (lines 72-78)  

  - **.cursorrules**: Added detailed section 15.1 with extensive guidance,
  examples, and best practices for AI agents (lines 193-205)


  ### Approach Taken


  - Focused on outcome-oriented, testable, and verifiable acceptance criteria

  - Provided clear examples of good vs bad acceptance criteria in all files

  - Emphasized the distinction between "what" (acceptance criteria) and "how"
  (implementation plan)

  - Included measurable examples (e.g., "P95 latency ≤ 50 ms", "System sends
  confirmation email")

  - Discouraged implementation steps in acceptance criteria sections


  ### Technical Decisions


  - Maintained consistency across all three agent instruction files

  - Used concrete examples to illustrate concepts rather than abstract
  guidelines

  - Structured guidance to be immediately actionable for AI agents

  - Preserved existing workflow and CLI command documentation while enhancing AC
  guidance


  ### Key Improvements


  - Clear separation of concerns between acceptance criteria and implementation
  plans

  - Emphasis on testable, verifiable, and outcome-focused criteria

  - Practical examples showing both good and bad patterns

  - Guidance on when to add implementation plan sections

  - Instructions tailored specifically for AI agent workflow
acceptance_criteria:
  - index: 1
    text: >-
      CLAUDE.md contains clear guidelines on writing outcome-focused acceptance
      criteria
    checked: true
  - index: 2
    text: AGENTS.md includes examples of good vs bad acceptance criteria
    checked: true
  - index: 3
    text: >-
      .cursorrules has updated instructions for AI agents about acceptance
      criteria
    checked: true
  - index: 4
    text: >-
      Guidelines clearly distinguish between acceptance criteria and
      implementation plans
    checked: true
  - index: 5
    text: Examples show acceptance criteria using measurable outcomes and behaviors
    checked: true
  - index: 6
    text: >-
      Instructions emphasize that acceptance criteria should be
      testable/verifiable
    checked: true
  - index: 7
    text: >-
      Guidelines discourage step-by-step implementation tasks in acceptance
      criteria
    checked: true
  - index: 8
    text: >-
      Documentation includes best practices for when to add implementation plan
      sections
    checked: true
definition_of_done: []
comments: []
---
