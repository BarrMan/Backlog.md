/**
 * Regression guard for the 2026-10-03 incident, where a test teardown issued `kill-server`
 * without a socket label and destroyed every tmux session on the developer's machine.
 *
 * The failure mode was silent because nothing asserted the label: the socket arrived from a
 * PATH stub that could be missing, and a bare `kill-server` falls back to the default socket
 * rather than erroring. These tests pin the label contract so that path cannot reopen.
 */

import { describe, expect, it } from "bun:test";
import {
	assertIsolatedSocket,
	isolatedTmuxServer,
	killTmuxServer,
	killTmuxServerArgv,
	TEST_TMUX_SOCKET_PREFIX,
	uniqueTmuxSocket,
} from "./tmux-test-server.ts";

const realTmux = Bun.which("tmux") && process.platform !== "win32" ? it : it.skip;

describe("test tmux socket isolation", () => {
	it("mints unique labels that can never be a live socket name", () => {
		const first = uniqueTmuxSocket("workspace-pty");
		const second = uniqueTmuxSocket("workspace-pty");
		expect(first).not.toBe(second);
		expect(first.startsWith(`${TEST_TMUX_SOCKET_PREFIX}-`)).toBe(true);
		for (const socket of [first, second]) {
			expect(socket).not.toBe("default");
			expect(socket).not.toBe("main");
			expect(() => assertIsolatedSocket(socket)).not.toThrow();
		}
	});

	it("refuses every label that could address the default socket", () => {
		for (const socket of ["default", "main", "", "backlog-workspace-e03c48451608", "probe", "../default"]) {
			expect(() => assertIsolatedSocket(socket)).toThrow(/default socket/);
		}
	});

	it("always passes -L and -f /dev/null to the teardown argv", () => {
		const socket = uniqueTmuxSocket("argv");
		const argv = killTmuxServerArgv(socket, "/opt/homebrew/bin/tmux");
		expect(argv.slice(0, 5)).toEqual(["/opt/homebrew/bin/tmux", "-f", "/dev/null", "-L", socket]);
		expect(argv.at(-1)).toBe("kill-server");
	});

	it("builds a libtmux server pinned to the isolated socket", () => {
		const socket = uniqueTmuxSocket("libtmux");
		const server = isolatedTmuxServer(socket);
		expect(server.socketName).toBe(socket);
		expect(() => isolatedTmuxServer("default")).toThrow(/default socket/);
	});

	realTmux("kills only the server it names, and leaves the default socket alone", async () => {
		const tmuxBinary = Bun.which("tmux") as string;
		const socket = uniqueTmuxSocket("guard");
		const defaultSessions = () => {
			const listed = Bun.spawnSync([tmuxBinary, "list-sessions", "-F", "#{session_name}"]);
			return listed.exitCode === 0 ? listed.stdout.toString().trim() : "";
		};
		const before = defaultSessions();
		const started = Bun.spawnSync([
			tmuxBinary,
			"-f",
			"/dev/null",
			"-L",
			socket,
			"new-session",
			"-d",
			"-s",
			"guard-session",
		]);
		expect(started.exitCode).toBe(0);
		try {
			const listed = Bun.spawnSync([
				tmuxBinary,
				"-f",
				"/dev/null",
				"-L",
				socket,
				"list-sessions",
				"-F",
				"#{session_name}",
			]);
			expect(listed.stdout.toString()).toContain("guard-session");
			await killTmuxServer(socket);
			const deadline = Date.now() + 5_000;
			while (Date.now() < deadline) {
				const probe = Bun.spawnSync([tmuxBinary, "-f", "/dev/null", "-L", socket, "list-sessions"]);
				if (probe.exitCode !== 0) break;
				await Bun.sleep(25);
			}
			const probe = Bun.spawnSync([tmuxBinary, "-f", "/dev/null", "-L", socket, "list-sessions"]);
			expect(probe.exitCode).not.toBe(0);
			expect(defaultSessions()).toBe(before);
		} finally {
			await killTmuxServer(socket);
		}
	});
});
