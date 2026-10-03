# Agent Instructions — Backlog.md

## Rebuild the binary after every code change

**After each code change, run `bun run build`.**

This is not optional and not batchable at end-of-task. Rebuild immediately after the change.

### Why

`/opt/homebrew/bin/backlog` is a symlink:

```
/opt/homebrew/bin/backlog -> /Users/imribarr/Projects/Backlog.md/dist/backlog
```

So `backlog` runs whatever `dist/backlog` happened to be at the time of the last build. Editing
`src/**` changes nothing about what the `backlog` command actually does.

### The trap this prevents

A passing test suite proves the *source tree* is correct. It says nothing about the binary.
Handing back a stale binary makes a correct fix look broken, and a broken fix look fixed.

This has already happened repeatedly on this project. On 2026-10-03 `dist/backlog` was built at
09:15 while `src/agent-workspace/tmux-workspace.ts` was edited at 09:48 — 14 source files were
newer than the binary. Manual retest of the quit fix was blocked until the next rebuild.

**Never report a fix as verified until the binary has been rebuilt and the verification run
against the rebuilt binary.** State explicitly when a rebuild happened.

### Verify the rebuild landed

```sh
bun run build
find src -name '*.ts' -newer dist/backlog   # must print nothing
```

If the second command lists files, the build did not pick them up. Do not proceed to manual
testing.

### When tests and manual verification disagree

The test suite runs against source. The user runs against `dist/backlog`. When those disagree,
suspect a stale binary before suspecting the code.