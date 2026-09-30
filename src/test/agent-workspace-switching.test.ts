import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import type { AgentSessionService } from "../agent-workspace/sessions.ts";
import { Core } from "../core/backlog.ts";
import { AgentWorkspaceController, createWorkspaceViewState } from "../ui/agent-workspace.ts";
import { createScreen } from "../ui/tui.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

type Widget = {
	children?: Widget[];
	content?: string;
	getContent?(): string;
	getValue?(): string;
	setValue?(value: string): void;
	options?: { label?: string };
	selected?: number;
	emit(event: string, ...args: unknown[]): boolean;
	on?(event: string, listener: (...args: unknown[]) => void): unknown;
	listenerCount?(event: string): number;
	listeners?(event: string): Array<(...args: unknown[]) => void>;
};

function press(widget: Widget, screen: Widget, name: string, character = ""): void {
	const key = { name, full: name };
	widget.emit("keypress", character, key);
	widget.emit(`key ${name}`, character, key);
	if (widget !== screen) screen.emit("keypress", character, key);
}

function content(widget: Widget | undefined): string {
	return widget?.getContent?.() ?? widget?.content ?? "";
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${message}`);
}

describe("agent workspace Board switching", () => {
	it("returns Board from navigation and restores an unsaved draft and selection", async () => {
		const directory = createUniqueTestDir("agent-workspace-switching");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const state = createWorkspaceViewState();
		const service = {
			list: async () => ({ taskId: "BACK-1", sessions: [] }),
			preview: async () => "",
		} as unknown as AgentSessionService;
		let firstScreen: (Widget & { destroy(): void; children: Widget[] }) | undefined;
		let secondScreen: (Widget & { destroy(): void; children: Widget[] }) | undefined;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace switching");
			const task = await core.createTaskFromInput({ title: "First task", status: "To Do" }, false);

			firstScreen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
			const first = new AgentWorkspaceController(core, { screen: firstScreen as never, service, state }).run();
			await waitUntil(
				() => firstScreen?.children.find((widget) => widget.options?.label === " Tasks ")?.selected === 1,
				"initial task selection",
			);
			const details = firstScreen.children.find((widget) => widget.options?.label === " Details ");
			press(firstScreen, firstScreen, "space", " ");
			press(details as Widget, firstScreen, "e", "e");
			const field = firstScreen.children.find((widget) => widget.options?.label?.startsWith(" Title "));
			expect(field).toBeDefined();
			field?.setValue?.("First task draft");
			expect(field?.getValue?.()).toContain("draft");
			press(field as Widget, firstScreen, "S-b", "B");
			expect(state.selectedTaskId).toBe(task.task.id);
			press(field as Widget, firstScreen, "escape", "\x1b");
			press(details as Widget, firstScreen, "escape", "\x1b");
			press(firstScreen, firstScreen, "S-b", "B");
			expect(await first).toBe("board");

			secondScreen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
			const second = new AgentWorkspaceController(core, { screen: secondScreen as never, service, state }).run();
			await waitUntil(
				() =>
					secondScreen?.children.find((widget) => widget.options?.label === " Tasks ")?.selected === 1 &&
					content(secondScreen?.children.find((widget) => widget.options?.label === " Details ")).includes(
						"First task draft",
					),
				"restored selection and draft",
			);
			press(secondScreen, secondScreen, "q", "q");
			expect(await second).toBe("exit");
		} finally {
			firstScreen?.destroy();
			secondScreen?.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("reuses one screen without retaining workspace listeners or polling", async () => {
		const directory = createUniqueTestDir("agent-workspace-persistent-screen");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const state = createWorkspaceViewState();
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		let listCalls = 0;
		let unrelatedKeys = 0;
		const service = {
			list: async () => {
				listCalls += 1;
				return { taskId: "BACK-1", sessions: [] };
			},
			preview: async () => "",
		} as unknown as AgentSessionService;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Persistent workspace screen");
			const task = await core.createTaskFromInput({ title: "First task", status: "To Do" }, false);
			screen.on?.("keypress", () => {
				unrelatedKeys += 1;
			});
			const originalKeypressListeners = screen.listeners?.("keypress") ?? [];
			const first = new AgentWorkspaceController(core, {
				screen: screen as never,
				service,
				state,
				preserveScreen: true,
			}).run();
			await waitUntil(
				() => screen.children.find((widget) => widget.options?.label === " Tasks ")?.selected === 1,
				"first mount",
			);
			press(screen, screen, "S-b", "B");
			expect(await first).toBe("board");
			expect(screen.children).toHaveLength(0);
			// Preserve the pre-existing listener identity across mounts; Workspace must not
			// remove unrelated handlers or leave one of its own on the shared screen.
			const listenersAfterFirstClose = screen.listeners?.("keypress") ?? [];
			expect(listenersAfterFirstClose).toEqual(originalKeypressListeners);
			const callsAfterClose = listCalls;
			await Bun.sleep(2100);
			expect(listCalls).toBe(callsAfterClose);

			const second = new AgentWorkspaceController(core, {
				screen: screen as never,
				service,
				state,
				preserveScreen: true,
			}).run();
			await waitUntil(
				() => screen.children.find((widget) => widget.options?.label === " Tasks ")?.selected === 1,
				"second mount",
			);
			expect(state.selectedTaskId).toBe(task.task.id);
			press(screen, screen, "q", "q");
			expect(await second).toBe("exit");
			expect(screen.listeners?.("keypress")).toEqual(listenersAfterFirstClose);
			expect(unrelatedKeys).toBeGreaterThan(0);
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});
});
