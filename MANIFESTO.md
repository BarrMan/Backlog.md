# The Backlog.md Manifesto

Backlog.md is a Markdown-native task manager for humans and AI agents. It keeps
intent, scope, plans, acceptance criteria, notes, decisions, and outcomes in durable
plain-text project records.

The central idea is simple: work is easier to steer when its intent is readable before
implementation, its progress is visible while it happens, and its outcome remains in
the repository afterwards. Agents can accelerate the loop, but human understanding and
judgment remain the point of the system.

## The First Users

**Humans and agents are both first-class users.** Backlog.md remains useful without
an AI agent, and agent workflows operate on the same records that humans can inspect
and control.

That means:

- A person can create, inspect, update, organize, diagnose, and repair work without an agent.
- Product copy, task records, diagnostics, and recovery information are human-readable.
- Automation is optional. It may reduce toil, but it is not a prerequisite for safe use.
- Agent integrations expose the product's existing model; they do not define a separate product.
- Consequential automation exposes clear, reviewable intent before it mutates project state.

## The Core Product Loop

```text
intent -> scope -> plan -> work -> verify -> record
```

Backlog.md preserves the context around work as it moves through that loop:

- **Intent:** the desired change and why it matters.
- **Scope:** the boundaries, acceptance criteria, dependencies, and tradeoffs that make the work understandable.
- **Plan:** the current approach and relevant system context close to execution time.
- **Work:** one reviewable unit connected to the records that explain it.
- **Verification:** evidence that the result matches the accepted scope.
- **Record:** the completed, archived, or superseded history that future humans and agents can read.

Humans may use the loop directly. Agents are collaborators in the same loop, not a
separate mode with a different source of truth.

## The Source of Truth

Backlog state lives in human-readable Markdown records and project-local configuration.
Application-owned fields use structured frontmatter; free-form Markdown remains readable
with ordinary tools.

- Markdown is the durable substrate for tasks, drafts, documents, decisions, milestones, notes, plans, and outcomes.
- Project configuration defines local shape: backlog directory, task identity, statuses, priorities, projects, defaults, and workflow preferences.
- Product commands perform semantic mutations so metadata, relationships, and history stay consistent.
- Completion preserves finished work as history; archiving separates canceled, duplicate, or invalid work from active records.
- Git is optional, but when present it provides reviewable evidence and history.
- Ordering and serialization are deterministic so diffs explain meaningful changes.
- No account, hosted backend, or telemetry is required for the core workflow.
- Internal source-code APIs are implementation details, not a supported integration surface.

## Surface Hierarchy

The product has several interfaces, but they express one coherent model.

1. **The CLI is canonical.** It defines the complete, scriptable workflow for humans, agents, and automation.
2. **Stable command output is a public integration surface.** Plain output, JSON output, and watchable reads keep their documented meaning.
3. **CLI instructions are the canonical agent guidance.** Shipped agent guidance mirrors CLI semantics rather than inventing a parallel workflow.
4. **Terminal, browser, workspace, and agent-session surfaces are local views over the same records.** They make common work clearer without changing the model.
5. **MCP is an optional adapter.** It remains useful for clients that prefer it, but features are not designed MCP-first or made available only through MCP.

All surfaces preserve the same validation, safety, identity, and meaning.

## Interface Posture

The browser is **desktop-first with a usable responsive baseline**. It is not desktop-only,
and it is not mobile-first.

Human-facing interfaces prioritize legible information, context-appropriate controls,
sound keyboard and focus behavior, and clear destructive-action previews.

## Design Principles

1. **Human-readable first.** A task, diagnostic, repair report, or project record explains itself without requiring source-code knowledge or an AI prompt.
2. **One model for humans and agents.** Agent-only meanings, hidden conventions, and separate recovery paths are outside the product model.
3. **Local-first ownership.** Users own their files and can work without a service or account.
4. **Review before consequence.** Specifications, plans, destructive actions, and automated repairs expose an understandable review point proportional to their risk.
5. **Fail closed when identity is ambiguous.** The product does not guess which record a read or mutation targets.
6. **Deterministic and recoverable where possible.** Preview, explicit confirmation, atomic writes, validation, and useful recovery evidence make plain files safe to operate on.
7. **Stable, human-friendly identity.** Task IDs remain readable and incrementally numeric; collision prevention preserves human-friendly identity instead of replacing it with opaque random identifiers.
8. **Surface consistency.** Validation, defaults, filtering, and mutation semantics agree across interfaces unless there is a deliberate product reason to differ.
9. **Reviewable units.** Backlog.md makes work easy to split, inspect, relate, complete, archive, and preserve as understandable records.
10. **Simplicity earns trust.** One shared implementation and a small public surface beat layers, aliases, or compatibility machinery without a proven need.

## Boundaries

Backlog.md is not:

- an agent-only orchestration system;
- a hosted project-management service that owns user data;
- a JavaScript or TypeScript library API for external consumers;
- an MCP-first product;
- a mobile-first web application;
- a substitute for human product and engineering judgment.

These boundaries do not prohibit useful integrations or incidental capabilities. They
keep the center of gravity clear.

## Risks, Named Honestly

1. **Agent tunnel vision.** Optimizing only for automated workflows can make ordinary human use confusing or impossible.
2. **Surface drift.** CLI, terminal views, browser, workspace, and adapters can acquire different meanings.
3. **Plain-text corruption.** Friendly files are still structured state, so safety depends on semantic mutations, validation, and recovery evidence.
4. **Automation outrunning review.** Agents can create more work and code than a human can responsibly inspect.
5. **Complexity creep.** Every workflow can justify another layer or public API.
6. **Interface neglect.** A correct feature can still be unusable when information is illegible or controls are unclear.

## Product Fit Tests

A product change fits Backlog.md when it:

- remains understandable and useful without an agent;
- is complete in the canonical CLI and shared model before adapters;
- preserves local ownership, readable state, and reviewable evidence;
- fails safely when identity or intent is ambiguous;
- communicates clearly in human-facing interfaces;
- earns its complexity through immediate user value.

Changes that alter these principles are product-direction changes, not implementation details.
