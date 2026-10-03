/**
 * The only sanctioned way for a test to name, create, or destroy a tmux server.
 *
 * Every tmux socket is created on an explicit unique label and destroyed through
 * {@link killTmuxServer}, which refuses any label that is not clearly test-owned. A bare
 * `tmux kill-server` with no `-L` resolves to the developer's *default* socket and destroys
 * every unrelated session on the machine, so the refusal is a hard failure rather than a
 * convention: a test that loses its socket label must break, not fall back to `default`.
 */

import { rm } from "node:fs/promises";
import { Server } from "libtmux";

/** Prefix every test-owned socket label carries. `default` and `main` can never match. */
export const TEST_TMUX_SOCKET_PREFIX = "backlog-test";

const TEST_TMUX_SOCKET_PATTERN = new RegExp(`^${TEST_TMUX_SOCKET_PREFIX}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$`);

/** Reserve a unique socket label for one test. */
export function uniqueTmuxSocket(label: string): string {
	const suffix = crypto.randomUUID().slice(0, 8);
	const safeLabel = label.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "suite";
	const socket = `${TEST_TMUX_SOCKET_PREFIX}-${safeLabel}-${suffix}`;
	assertIsolatedSocket(socket);
	return socket;
}

/**
 * Reject any socket label that is not provably test-owned.
 *
 * This is the guard that stops a `kill-server` from ever reaching the default socket: it runs
 * before a process is spawned, so a mislabelled teardown throws instead of killing live state.
 */
export function assertIsolatedSocket(socket: string): void {
	if (TEST_TMUX_SOCKET_PATTERN.test(socket)) return;
	throw new Error(
		`Refusing to address tmux socket ${JSON.stringify(socket)}: test sockets must look like ` +
			`${TEST_TMUX_SOCKET_PREFIX}-<label>-<8 hex chars>. A bare "tmux kill-server" hits the ` +
			`developer's default socket and destroys unrelated live sessions.`,
	);
}

/** A libtmux server pinned to an isolated test socket, with `TMUX` cleared so it cannot inherit one. */
export function isolatedTmuxServer(socket: string): Server {
	assertIsolatedSocket(socket);
	return new Server({ socketName: socket, configFile: "/dev/null", environment: { ...process.env, TMUX: "" } });
}

/** The argv a test teardown uses. Exposed so the guard test can assert the `-L` is always present. */
export function killTmuxServerArgv(socket: string, tmuxBinary = Bun.which("tmux") as string): string[] {
	assertIsolatedSocket(socket);
	if (!tmuxBinary) throw new Error("tmux is not installed; cannot manage a test tmux server.");
	return [tmuxBinary, "-f", "/dev/null", "-L", socket, "kill-server"];
}

/** Remove the socket file tmux leaves behind after `kill-server`. */
export async function removeTmuxSocket(socket: string): Promise<void> {
	assertIsolatedSocket(socket);
	if (process.getuid === undefined) return;
	await rm(`/private/tmp/tmux-${process.getuid()}/${socket}`, { force: true });
}

/**
 * Destroy one test-owned tmux server and its socket file.
 *
 * Best effort by design: the server is usually already gone, and an absent server is success.
 * The socket-label assertion is not best effort — it throws before anything is spawned.
 */
export async function killTmuxServer(socket: string): Promise<void> {
	const child = Bun.spawn(killTmuxServerArgv(socket), { stdout: "ignore", stderr: "ignore" });
	await child.exited.catch(() => undefined);
	await removeTmuxSocket(socket);
}
