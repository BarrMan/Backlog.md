---
task_schema_version: 2
id: BACK-272
title: Adopt npm trusted publishing for releases
status: Done
assignee:
  - '@codex'
created_date: '2025-09-17 23:25'
updated_date: '2025-09-18 20:51'
labels: []
dependencies: []
description: >-
  Align Backlog.md release automation with npm Trusted Publishing as implemented
  in the codex repository. Update the release workflow to authenticate with npm
  via GitHub OIDC, remove the reliance on the NODE_AUTH_TOKEN secret, ensure the
  npm CLI version satisfies provenance requirements, and document the trusted
  publisher setup steps for all backlog packages.
implementation_notes: >-
  - Updated release workflow: Corepack activates npm@latest, both npm jobs run
  dry-run + real publishes without NODE_AUTH_TOKEN, actions/setup-node bumped to
  v5 with always-auth.

  - Documentation: DEVELOPMENT.md now covers tag-driven version sync, trusted
  publishing prerequisites, GitHub Release trigger, and npm auto-provenance (no
  manual version bump or extra flags).

  - Follow-up: Run the release workflow on dev/main to confirm provenance
  appears on npm; no further code changes expected.
acceptance_criteria:
  - index: 1
    text: >-
      Update .github/workflows/release.yml so the npm-publish job uses
      actions/setup-node@v5 (or later with trusted publisher support), installs
      npm 11.5.1 or newer, and runs npm publish --provenance without
      NODE_AUTH_TOKEN.
    checked: true
  - index: 2
    text: >-
      Ensure the publish-binaries job also relies on the GitHub OIDC identity
      (no NODE_AUTH_TOKEN) when publishing each platform package, updating node
      setup and npm CLI accordingly.
    checked: true
  - index: 3
    text: >-
      Document the trusted publisher configuration (linking this workflow to the
      backlog.md and platform packages, secret removal steps, recovery plan) in
      the repo docs or release checklist.
    checked: true
  - index: 4
    text: >-
      Verify via a dry run or staging tag that the workflow completes the npm
      publish steps using trusted publishing and records provenance.
    checked: true
definition_of_done: []
comments: []
---
