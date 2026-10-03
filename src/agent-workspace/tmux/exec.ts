import { TmuxCommandError } from "libtmux";
import type { TmuxCommandOptions, TmuxCommandRunner, TmuxResult } from "./types.ts";

/**
 * `kill-session` reports an absent session or an absent server on stderr; teardown must treat that
 * as "already done" rather than as a failure. Moved here verbatim from `tmux-workspace.ts`.
 *
 * Callers must not re-derive this: `server-session.killSessionIfPresent` and anything else that
 * treats a missing session as success depend on exactly this pattern.
 */
export const SESSION_ABSENT = /can't find session|no server running|error connecting/;

/**
 * The narrower test `listPanes` uses: with no server there is nothing to list, which is not an
 * error either. Moved here verbatim from `tmux-workspace.ts`.
 */
export const NO_SERVER_RUNNING = /no server running/i;

/** The four subcommands whose `require` invocations are traced to the diag log. Deliberate. */
const DIAG_REQUIRED_SUBCOMMANDS = new Set(["select-pane", "send-keys", "select-window", "set-option"]);

/** Anything injected by the caller that `exec` needs but does not own. */
export interface TmuxExecDependencies {
	/** The tmux command surface — a libtmux `Server`, or a test double that captures argv. */
	readonly runner: TmuxCommandRunner;
	/**
	 * Optional diagnostic sink. Called from `require` for the four traced subcommands before the
	 * command runs. The workspace passes its `diag()` (which appends to `/tmp/focus.log` and
	 * swallows its own errors); the layer does not guard it, because the current code does not.
	 */
	readonly diag?: (line: string) => void;
}

/**
 * The argv execution surface shared by every object-domain module.
 *
 * Three methods, and the split between them is load-bearing:
 * - `run` never throws for a non-zero exit; a tmux failure is a *value*.
 * - `require` throws and discards stdout.
 * - `command` throws but hands the result back.
 */
export interface TmuxExec {
	/**
	 * Runs a raw tmux argv. Never throws for a non-zero exit: a `TmuxCommandError` from the runner
	 * is converted into a `TmuxResult`. Rejection is reserved for programming errors (an empty
	 * argv, or an error that is not a `TmuxCommandError` and is propagated untouched).
	 *
	 * `argv[0]` is the tmux subcommand and `argv.slice(1)` its arguments — no quoting, no
	 * reordering, and no escaping of `#` in format strings.
	 */
	run(argv: readonly string[], options?: TmuxCommandOptions): Promise<TmuxResult>;
	/** Runs, then throws `` `${message}: ${stderr.trim() || "tmux command failed"}` `` on failure. */
	require(argv: readonly string[], message: string, options?: TmuxCommandOptions): Promise<void>;
	/** Runs and returns the result, throwing the same error as `require` on a non-zero exit. */
	command(argv: readonly string[], message: string, options?: TmuxCommandOptions): Promise<TmuxResult>;
}

/**
 * The concrete `TmuxExec`. Holds the injected runner and diag sink as fields; there is no module
 * state, so every object-domain module can still take a `TmuxExec` without importing any other
 * module of the layer.
 *
 * The `TmuxExec` *interface* stays the structural contract — tests and `tmux-orphan-sweep.ts`
 * build `{ run, require, command }` object literals, so the interface must not become a class.
 */
export class TmuxExecImpl implements TmuxExec {
	private readonly runner: TmuxCommandRunner;
	private readonly diag?: (line: string) => void;

	constructor(dependencies: TmuxExecDependencies) {
		this.runner = dependencies.runner;
		this.diag = dependencies.diag;
	}

	async run(argv: readonly string[], options?: TmuxCommandOptions): Promise<TmuxResult> {
		const [command, ...commandArgs] = argv;
		if (!command) throw new Error("tmux command is missing");
		try {
			return { exitCode: 0, stdout: outputText(await this.runner.cmd(command, commandArgs, options)), stderr: "" };
		} catch (error) {
			const failure = this.toResult(error);
			if (failure) return failure;
			throw error;
		}
	}

	async command(argv: readonly string[], message: string, options?: TmuxCommandOptions): Promise<TmuxResult> {
		const result = await this.run(argv, options);
		if (result.exitCode !== 0) throw failure(message, result);
		return result;
	}

	async require(argv: readonly string[], message: string, options?: TmuxCommandOptions): Promise<void> {
		if (DIAG_REQUIRED_SUBCOMMANDS.has(argv[0] ?? "")) this.diag?.(`require ${JSON.stringify(argv)}`);
		const result = await this.run(argv, options);
		if (result.exitCode !== 0) throw failure(message, result);
	}

	private toResult(error: unknown): TmuxResult | undefined {
		if (!(error instanceof TmuxCommandError)) return undefined;
		return { exitCode: error.exitCode, stdout: outputText(error.stdout), stderr: outputText(error.stderr) };
	}
}

/**
 * Build the exec surface over an injected tmux command runner.
 *
 * A thin wrapper kept for the three production consumers and the eight sibling modules of the layer
 * that already call it; `new TmuxExecImpl(dependencies)` is equivalent.
 */
export function createTmuxExec(dependencies: TmuxExecDependencies): TmuxExec {
	return new TmuxExecImpl(dependencies);
}

/** The one error-message convention of the layer. */
function failure(message: string, result: { readonly stderr: string }): Error {
	return new Error(`${message}: ${result.stderr.trim() || "tmux command failed"}`);
}

/**
 * Normalise an array of output lines into the single string the layer hands back.
 *
 * The trailing newline is load-bearing: callers `.trim()` today and would also be correct without
 * it, but the split-on-`\n` sites (`listPanes`, `killPaneProcessTrees`) depend on the shape.
 * Nothing here trims — an empty output is `""`, not `"\n"`.
 */
function outputText(lines: readonly string[]): string {
	return lines.length ? `${lines.join("\n")}\n` : "";
}
