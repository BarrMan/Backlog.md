import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import type { AgentSessionService } from "../agent-workspace/sessions.ts";
import { Core } from "../core/backlog.ts";
import { TUIRenderer } from "../ui/board/tui-renderer.ts";
import { getBoardFooterContent } from "../ui/footer-content.ts";
import { formatKeymap, keymapKeys, matchesKey, uiKeymap } from "../ui/keymap.ts";
import { createScreen } from "../ui/tui.ts";
import { AgentWorkspaceController } from "../ui/workspace/controller.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

type EmittingScreen = ReturnType<typeof createScreen> & {
	emit(event: string, ...args: unknown[]): boolean;
	children: Array<{ content?: string; getContent?(): string }>;
};

function press(screen: EmittingScreen, keyName: string, character = ""): void {
	const key = { name: keyName, full: keyName };
	screen.emit("keypress", character, key);
	screen.emit(`key ${keyName}`, character, key);
}

/**
 * A stand-in for the native tmux host. A real `TmuxWorkspace` builds a tmux server whose bootstrap
 * `tmux new-session -d -P` client outlives the test process, so a run inside the user's own tmux left
 * real `backlog-workspace-*` sessions behind on their default socket. This suite covers key dispatch
 * and footer text only, so it injects a host and never starts tmux.
 */
class StubWorkspaceHost {
	readonly calls: string[] = [];
	async showBoard(): Promise<void> {
		this.calls.push("showBoard");
	}
	async showAgentSession(taskId: string | undefined, sessionId?: string): Promise<void> {
		this.calls.push(`showAgentSession:${taskId ?? ""}:${sessionId ?? ""}`);
	}
	async focusAgent(zoom: boolean): Promise<void> {
		this.calls.push(`focusAgent:${zoom}`);
	}
	async takeTaskRequest(): Promise<string | undefined> {
		this.calls.push("takeTaskRequest");
		return undefined;
	}
	async quitWorkspace(): Promise<void> {
		this.calls.push("quitWorkspace");
	}
}

function defaultSocketSessions(): Set<string> {
	const listed = Bun.spawnSync(["tmux", "list-sessions", "-F", "#{session_name}"]);
	if (listed.exitCode !== 0) return new Set();
	return new Set(listed.stdout.toString().split("\n").filter(Boolean));
}

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(10);
	}
	throw new Error("Timed out waiting for TUI state");
}

describe("TUI keymap", () => {
	it("uses one configured binding for both a blessed handler and its displayed label", () => {
		const screen = createScreen({ smartCSR: false });
		let invoked = false;
		try {
			screen.key(keymapKeys("shared", "pageUp"), () => {
				invoked = true;
			});
			(screen as unknown as { emit(event: string, ...args: unknown[]): void }).emit("key pageup", "", {
				name: "pageup",
				full: "pageup",
			});
			expect(invoked).toBe(true);
			expect(formatKeymap("shared", "pageUp")).toBe("PgUp");
			expect(uiKeymap.shared.pageUp).toEqual(["pageup"]);
		} finally {
			screen.destroy();
		}
	});

	it("does not treat modified input as its unmodified key name", () => {
		expect(matchesKey(["n"], { name: "n", ctrl: true })).toBe(false);
		expect(matchesKey(["C-n"], { name: "n", ctrl: true })).toBe(true);
		expect(matchesKey(["N"], { name: "n", full: "N", shift: true })).toBe(true);
		expect(matchesKey(["?"], { name: "?", full: "?" })).toBe(true);
	});

	it("dispatches remapped Board shortcuts and updates its footer", async () => {
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as EmittingScreen;
		const keymap = uiKeymap as unknown as { board: { workspace: string[] } };
		const original = keymap.board.workspace;
		let board: Promise<void> | undefined;
		let workspaceOpens = 0;
		try {
			keymap.board.workspace = ["x"];
			board = new TUIRenderer(
				[
					{
						id: "BACK-1",
						title: "Task",
						status: "To Do",
						assignee: [],
						createdDate: "2025-01-01",
						labels: [],
						dependencies: [],
					},
				],
				["To Do"],
				"horizontal",
				20,
				{
					screen,
					preserveScreen: true,
					onWorkspacePress: async () => {
						workspaceOpens += 1;
					},
				},
			).run();
			press(screen, "S-b");
			expect(workspaceOpens).toBe(0);
			press(screen, "x", "x");
			await board;
			expect(workspaceOpens).toBe(1);
			expect(getBoardFooterContent()).toContain("[X]{/} Workspace");
		} finally {
			keymap.board.workspace = original;
			if (board) {
				press(screen, "q", "q");
				await board;
			}
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
		}
	});

	it("dispatches remapped Workspace shortcuts and updates its footer", async () => {
		const directory = createUniqueTestDir("ui-keymap-workspace");
		const before = defaultSocketSessions();
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as EmittingScreen;
		const keymap = uiKeymap as unknown as { workspace: { newTask: string[] } };
		const original = keymap.workspace.newTask;
		let workspace: Promise<"board" | "exit"> | undefined;
		let composerCalls = 0;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Keymap workspace");
			keymap.workspace.newTask = ["x"];
			workspace = new AgentWorkspaceController(core, {
				screen,
				service: {
					list: async (taskId: string) => ({ taskId, sessions: [] }),
					recover: async () => {},
					preview: async () => "",
				} as unknown as AgentSessionService,
				taskComposer: async () => {
					composerCalls += 1;
					return null;
				},
				host: new StubWorkspaceHost(),
			}).run();
			await waitUntil(() => screen.children.length > 0);
			press(screen, "n", "n");
			expect(composerCalls).toBe(0);
			press(screen, "x", "x");
			await waitUntil(() => composerCalls === 1);
			const footer = screen.children.map((child) => child.getContent?.() ?? child.content ?? "").join("\n");
			expect(footer).toContain("[X] New");
			screen.destroy();
			await workspace;
			workspace = undefined;
		} finally {
			keymap.workspace.newTask = original;
			if (workspace) {
				screen.destroy();
				await workspace;
			}
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			expect([...defaultSocketSessions()].filter((name) => !before.has(name))).toEqual([]);
			await safeCleanup(directory);
		}
	});
});
