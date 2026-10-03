/**
 * Shared types for the tmux abstraction layer.
 *
 * This module has zero methods and zero behaviour: it exists so that `exec.ts` and the seven
 * object-domain modules (`server-session`, `window`, `pane`, `options`, `signals-keys`, `channels`,
 * `client`) can agree on the shape of a tmux invocation without depending on each other.
 *
 * The layer wraps RAW ARGV. It does not wrap libtmux: the audit in `docs/tmux-layer-spec.md` §0
 * found that libtmux rewrites format strings (`literalFormat()` turns `#` into `##`) and throws
 * where the current code branches on an exit code. Every argv emitted here is the argv the tmux CLI
 * would receive, byte for byte.
 */

/**
 * The outcome of one tmux invocation.
 *
 * `stdout` and `stderr` keep the trailing-newline normalisation of `outputText()`: a non-empty
 * array of lines is joined with `\n` and given a trailing `\n`; an empty array yields `""`.
 * Callers `.trim()` the value today and must keep doing so — the layer deliberately does not trim,
 * because trimming would break the two-field split that `paneLive` performs on
 * `#{pane_id} #{pane_dead}`.
 */
export type TmuxResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string };

/** Passed straight through to the underlying tmux `cmd`. Only `require`/`command` ever supply it. */
export type TmuxCommandOptions = { timeoutMs?: number | null };

/** A tmux target id — `@<n>` for a window, `%<n>` for a pane, `$0` for a session. Verbatim. */
export type TmuxTarget = string;

/** A tmux session name. */
export type TmuxSessionName = string;

/** A tmux key table, e.g. the workspace's own `backlog-workspace-<hash>` table. */
export type TmuxKeyTable = string;

/** A tmux `wait-for` channel name. */
export type TmuxChannel = string;

/**
 * The slice of a tmux server that this layer needs.
 *
 * `TmuxWorkspaceServer` from `tmux-workspace.ts` satisfies this structurally, and so does a plain
 * test double, so the layer never has to import the workspace module (which would be a cycle).
 *
 * `cmd` resolves with the command's stdout split into lines and rejects with libtmux's
 * `TmuxCommandError` on a non-zero exit; `exec.ts` is what turns that rejection into a value.
 */
export interface TmuxCommandRunner {
	cmd(command: string, args?: readonly string[], options?: TmuxCommandOptions): Promise<readonly string[]>;
}
