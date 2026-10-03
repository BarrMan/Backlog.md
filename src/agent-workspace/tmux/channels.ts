import type { TmuxExec } from "./exec.ts";
import type { TmuxChannel } from "./types.ts";

/**
 * tmux `wait-for` channels.
 *
 * There is no libtmux equivalent for any of this: `wait-for` appears nowhere in libtmux's dist but
 * a comment in `bounded_transport.js`, and `bind-key`/`unbind-key` are absent entirely. This is one
 * of the few genuinely raw-only surfaces in the refactor, which is exactly why it exists as a module
 * of its own rather than being folded into `signals-keys`.
 *
 * ## One channel per invocation
 *
 * `wait-for` accepts exactly one channel name, and tmux has no command chaining. A single argv
 * holding several channels — `["wait-for", "-S", a, ";", "wait-for", "-S", b]` — fails with
 * "too many arguments". The fan-out across listeners therefore stays a loop in the caller
 * (`updateWorkspaceState`), one `signalChannel` per channel, and is NOT collapsed here.
 *
 * ## `waitFor` blocks, and that is the design
 *
 * `tmux wait-for` suspends until a matching `signal` arrives. This module adds no timeout, no
 * retry, no sleep and no polling. The source has no timeout either: the waiter is released by
 * {@link TmuxChannelsImpl.signalChannel} on the *same* channel, and the two are coupled through the
 * caller's `closed` flag. See the module note on that coupling below — do not add a bound here.
 *
 * ## The pairing lives in the caller, not here
 *
 * `waitFor` and `signalChannel` are a matched pair and the pairing is maintained entirely outside
 * this module. Teardown in the caller sets `closed = true` and then calls
 * `signalChannel(channel)`; the blocked `wait-for` returns, and the caller's `while (!closed)`
 * loop exits. This module holds no state and never signals a channel of its own accord, so it
 * cannot break the pair on its own — but it must not be given a timeout either. A timeout would
 * mask a genuinely missing teardown signal, which is the exact diagnostic that a leak exists. An
 * unbounded waiter that later turns out to be unbounded-because-of-a-bug is the intended failure
 * mode; a silently-truncated subscription is not.
 *
 * ## No socket arguments, ever
 *
 * The argv built below is the *complete* argv. There is no `-L`, no socket name, and no inference of
 * tmux's ambient/default socket. Prior to this module, resolving tmux's default socket instead of an
 * explicitly-passed one destroyed a live user session; these methods may only operate on the
 * injected exec surface. Do not add socket arguments.
 */
export interface TmuxChannels {
	/** Release every waiter currently blocked on `channel`. */
	signalChannel(channel: TmuxChannel, message?: string): Promise<void>;
	/** Block until `channel` is signalled. Returns when a `signalChannel` for it lands. */
	waitFor(channel: TmuxChannel, message?: string): Promise<void>;
}

/**
 * The concrete `TmuxChannels`. Holds the injected exec surface as a field and adds no module state,
 * so it stays injectable anywhere a `TmuxExec` structural literal is available.
 *
 * The `TmuxChannels` *interface* stays the structural contract, exactly as `TmuxExec` does in
 * `exec.ts`: consumers and tests build `{ signalChannel, waitFor }` literals.
 */
export class TmuxChannelsImpl implements TmuxChannels {
	private readonly exec: TmuxExec;

	constructor(exec: TmuxExec) {
		this.exec = exec;
	}

	/**
	 * `["wait-for", "-S", channel]`.
	 *
	 * The two source sites pass different failure messages — the fan-out in `updateWorkspaceState`
	 * and the teardown in `subscribeWorkspaceState` — so `message` is a parameter rather than a
	 * constant. The default exists only for the case where a caller has no site-specific wording.
	 */
	async signalChannel(channel: TmuxChannel, message = DEFAULT_SIGNAL_MESSAGE): Promise<void> {
		await this.exec.require(["wait-for", "-S", channel], message);
	}

	/**
	 * `["wait-for", channel]` — the blocking half.
	 *
	 * Deliberately unbounded, matching the source exactly. The promise settles when a
	 * `wait-for -S <channel>` arrives, or rejects if tmux itself fails; it never settles on a timer
	 * that this module invented. Any timeout here would silently truncate a subscription, so the
	 * absence is intentional and must survive future edits.
	 */
	async waitFor(channel: TmuxChannel, message = DEFAULT_WAIT_MESSAGE): Promise<void> {
		await this.exec.require(["wait-for", channel], message);
	}
}

/**
 * Build the channel surface over an injected exec surface.
 *
 * A thin wrapper kept for the production consumer in `tmux-workspace.ts` and any test double;
 * `new TmuxChannelsImpl(exec)` is equivalent.
 */
export function createTmuxChannels(exec: TmuxExec): TmuxChannels {
	return new TmuxChannelsImpl(exec);
}

/** Matches the fan-out site in `updateWorkspaceState`. */
const DEFAULT_SIGNAL_MESSAGE = "Could not notify tmux workspace state listeners";

/** Matches the waiter site in `subscribeWorkspaceState`. */
const DEFAULT_WAIT_MESSAGE = "Could not wait for tmux workspace state";
