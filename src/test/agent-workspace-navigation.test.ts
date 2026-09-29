import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import type { AgentSessionService } from "../agent-workspace/sessions.ts";
import type { AgentSession, TaskSessions } from "../agent-workspace/types.ts";
import { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { runAgentWorkspace } from "../ui/agent-workspace.ts";
import type { TaskComposerOptions } from "../ui/components/task-composer.ts";
import { createScreen } from "../ui/tui.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

type Widget = {
	children?: Widget[];
	content?: string;
	getContent?(): string;
	getValue?(): string;
	focus?(): void;
	items?: Widget[];
	options?: { label?: string };
	selected?: number;
	emit(event: string, ...args: unknown[]): boolean;
};

function press(widget: Widget, screen: Widget, name: string, character = ""): void {
	const key = { name, full: name };
	widget.emit("keypress", character, key);
	widget.emit(`key ${name}`, character, key);
	if (widget !== screen) screen.emit("keypress", character, key);
}

function widgets(root: Widget): Widget[] {
	return [root, ...(root.children ?? []).flatMap(widgets)];
}

function itemContents(widget: Widget | undefined): string[] {
	return widget?.items?.map((item) => item.getContent?.() ?? item.content ?? "") ?? [];
}

function content(widget: Widget | undefined): string {
	return widget?.getContent?.() ?? widget?.content ?? "";
}

async function waitUntil(predicate: () => boolean, message: string | (() => string)): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${typeof message === "function" ? message() : message}`);
}

function typeText(widget: Widget, screen: Widget, value: string): void {
	for (const character of value) press(widget, screen, character, character);
}

async function settleFocus(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function session(id: string): AgentSession {
	return {
		id,
		taskId: "BACK-1",
		preset: "test",
		presetSnapshot: { command: "", env: {}, prepare: "", worktree: false, bootstrap: "prompt" },
		configScope: "project",
		tmuxName: id,
		cwd: "/tmp",
		createdAt: id,
		status: "stopped",
		outputPath: "/tmp/output",
		bootstrapPath: "/tmp/bootstrap",
	};
}

describe("agent workspace navigation ownership", () => {
	it("restores the real blessed screen after an external attachment", async () => {
		const directory = createUniqueTestDir("agent-workspace-attach-lifecycle");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & {
			destroy(): void;
			children: Widget[];
			lines: unknown;
			program: { isAlt: boolean; mouseEnabled: boolean };
		};
		const active = session("active");
		const sessions: TaskSessions = { taskId: "BACK-1", activeSessionId: active.id, sessions: [active] };
		let releaseAttach: (() => void) | undefined;
		let attachmentScreen: { isAlt: boolean; mouseEnabled: boolean; lines: unknown } | undefined;
		let resolved = false;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace attach lifecycle");
			await core.createTaskFromInput({ title: "Existing task", status: "To Do" }, false);
			const workspace = runAgentWorkspace(core, {
				screen: screen as never,
				service: {
					list: async () => sessions,
					preview: async () => "",
					attach: async () => {
						attachmentScreen = {
							isAlt: screen.program.isAlt,
							mouseEnabled: screen.program.mouseEnabled,
							lines: screen.lines,
						};
						await new Promise<void>((resolve) => {
							releaseAttach = resolve;
						});
					},
				} as unknown as AgentSessionService,
			});
			void workspace.then(() => {
				resolved = true;
			});
			await waitUntil(
				() => screen.children.find((widget) => widget.options?.label === " Tasks ")?.selected === 1,
				"initial task selection",
			);
			await waitUntil(() => screen.program.mouseEnabled, "workspace mouse mode");
			press(screen, screen, "enter", "\r");
			await waitUntil(() => attachmentScreen !== undefined, "session attachment");
			expect(attachmentScreen).toMatchObject({ isAlt: false, mouseEnabled: false });

			press(screen, screen, "q", "q");
			await Bun.sleep(10);
			expect(resolved).toBe(false);

			releaseAttach?.();
			await waitUntil(
				() => screen.program.isAlt && screen.program.mouseEnabled && screen.lines !== attachmentScreen?.lines,
				"alternate buffer and mouse mode restoration",
			);
			press(screen, screen, "q", "q");
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("creates with N and starts then attaches with Enter", async () => {
		const directory = createUniqueTestDir("agent-workspace-create-attach");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		const calls = { composer: 0, start: 0, attach: [] as string[] };
		let sessions: TaskSessions = { taskId: "BACK-1", sessions: [] };
		let created: Task | undefined;
		let completeComposer: (() => Promise<void>) | undefined;
		let completeStart: (() => void) | undefined;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace create attach");
			await core.createTaskFromInput({ title: "Existing task", status: "To Do" }, false);
			const service = {
				list: async () => sessions,
				preview: async () => "",
				start: async () => {
					calls.start += 1;
					await new Promise<void>((resolve) => {
						completeStart = resolve;
					});
					const started = session("started");
					sessions = { taskId: "BACK-1", activeSessionId: started.id, sessions: [started] };
					return started;
				},
				attach: async (_taskId: string, sessionId: string) => {
					calls.attach.push(sessionId);
				},
			} as unknown as AgentSessionService;
			const taskComposer = (options: TaskComposerOptions) =>
				new Promise<Task | null>((resolve) => {
					calls.composer += 1;
					completeComposer = async () => {
						created = await options.persist({ title: "Created task", status: "To Do" });
						resolve(created);
					};
				});
			const workspace = runAgentWorkspace(core, { screen: screen as never, service, taskComposer });
			await waitUntil(() => {
				const tree = screen.children.find((widget) => widget.options?.label === " Tasks ");
				return tree?.selected === 1;
			}, "initial task selection");

			press(screen, screen, "down");
			await waitUntil(() => {
				const tree = screen.children.find((widget) => widget.options?.label === " Tasks ");
				return tree?.selected === 2;
			}, "group selection");
			press(screen, screen, "n", "n");
			await waitUntil(() => calls.composer === 1, "composer open");
			press(screen, screen, "down");
			press(screen, screen, "enter", "\r");
			press(screen, screen, "q", "q");
			expect(calls.start).toBe(0);
			expect(screen.children.find((widget) => widget.options?.label === " Tasks ")?.selected).toBe(2);
			await completeComposer?.();
			await waitUntil(() => created !== undefined, "task creation");
			if (!created) throw new Error("Expected composer to create a task.");
			expect((await core.getTask(created.id))?.title).toBe("Created task");
			expect(calls.composer).toBe(1);
			expect(content(screen.children.find((widget) => widget.options?.label === " Live preview "))).toContain(
				"Press Enter",
			);

			press(screen, screen, "enter", "\r");
			press(screen, screen, "enter", "\r");
			await waitUntil(() => calls.start === 1, "session start");
			completeStart?.();
			await waitUntil(() => calls.attach.length === 1, "started session attachment");
			expect(calls).toEqual({ composer: 1, start: 1, attach: ["started"] });
			press(screen, screen, "enter", "\r");
			await waitUntil(() => calls.attach.length === 2, "existing session attachment");
			expect(calls).toEqual({ composer: 1, start: 1, attach: ["started", "started"] });

			press(screen, screen, "q", "q");
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("opens the composer with no task rows", async () => {
		const directory = createUniqueTestDir("agent-workspace-empty-create");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		let composer = 0;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace empty create");
			const workspace = runAgentWorkspace(core, {
				screen: screen as never,
				service: {
					list: async (taskId: string) => ({ taskId, sessions: [] }),
					preview: async () => "",
				} as unknown as AgentSessionService,
				taskComposer: async () => {
					composer += 1;
					return null;
				},
			});
			await waitUntil(
				() =>
					content(screen.children.find((widget) => widget.options?.label === " Details ")).includes("No tasks match"),
				"empty workspace",
			);
			press(screen, screen, "n", "n");
			await waitUntil(() => composer === 1, "composer from empty workspace");
			press(screen, screen, "q", "q");
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("keeps details and history arrows out of task navigation", async () => {
		const directory = createUniqueTestDir("agent-workspace-navigation");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace navigation");
			await core.createTaskFromInput({ title: "First task", status: "To Do" }, false);
			await core.createTaskFromInput({ title: "Second task", status: "To Do" }, false);
			const sessions: TaskSessions = {
				taskId: "BACK-1",
				activeSessionId: "second",
				sessions: [session("first"), session("second")],
			};
			const service = { list: async () => sessions, preview: async () => "" } as unknown as AgentSessionService;
			const workspace = runAgentWorkspace(core, { screen: screen as never, service });
			await waitUntil(() => {
				const tree = screen.children.find((widget) => widget.options?.label === " Tasks ");
				const details = screen.children.find((widget) => widget.options?.label === " Details ");
				return tree?.selected === 1 && content(details).includes("second");
			}, "initial task selection");
			const details = screen.children.find((widget) => widget.options?.label === " Details ");
			const preview = screen.children.find((widget) => widget.options?.label === " Live preview ");
			const tree = screen.children.find((widget) => widget.options?.label === " Tasks ");
			expect(tree?.selected).toBe(1);

			press(screen, screen, "space", " ");
			press(details as Widget, screen, "down");
			expect(tree?.selected).toBe(1);

			press(details as Widget, screen, "s", "s");
			await waitUntil(
				() =>
					content(preview)
						.split("\n")
						.some((line) => line.startsWith("> ") && line.endsWith(" second")),
				"latest history selection",
			);
			press(preview as Widget, screen, "up");
			expect(content(preview).split("\n")[0]).toMatch(/^> .* first$/);
			expect(tree?.selected).toBe(1);

			press(preview as Widget, screen, "escape", "\x1b");
			press(details as Widget, screen, "escape", "\x1b");
			press(screen, screen, "q", "q");
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("composes search and status filters without sending search input to an inline session", async () => {
		const directory = createUniqueTestDir("agent-workspace-filters");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		const calls = { input: 0, resetSize: 0 };
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace filters");
			await core.createTaskFromInput({ title: "Matching task", status: "To Do" }, false);
			await core.createTaskFromInput({ title: "Done task", status: "Done" }, false);
			const sessions: TaskSessions = { taskId: "BACK-1", activeSessionId: "active", sessions: [session("active")] };
			const service = {
				list: async () => sessions,
				preview: async () => "",
				sendInput: async () => {
					calls.input += 1;
				},
				resetSize: async () => {
					calls.resetSize += 1;
				},
			} as unknown as AgentSessionService;
			const workspace = runAgentWorkspace(core, { screen: screen as never, service });
			await waitUntil(() => {
				const tree = screen.children.find((widget) => widget.options?.label === " Tasks ");
				const details = screen.children.find((widget) => widget.options?.label === " Details ");
				return tree?.selected === 1 && content(details).includes("active");
			}, "initial task selection");
			const get = (predicate: (widget: Widget) => boolean) => widgets(screen).find(predicate);
			const tree = get((widget) => widget.options?.label === " Tasks ");
			const search = get((widget) => widget.getValue?.() === "");
			const status = get((widget) => widget.content === "All ▼");
			expect(tree).toBeDefined();
			expect(search).toBeDefined();
			expect(status).toBeDefined();
			const obsoleteDoneItem = tree?.items?.find((item) => content(item).includes("Done task"));
			expect(obsoleteDoneItem).toBeDefined();

			press(screen, screen, "tab", "\t");
			search?.focus?.();
			await settleFocus();
			expect(search?.getValue?.()).toBe("");
			typeText(search as Widget, screen, "matching");
			expect(search?.getValue?.()).toBe("matching");
			press(search as Widget, screen, "enter", "\r");
			await waitUntil(
				() =>
					itemContents(tree).some((item) => item.includes("Matching task")) &&
					!itemContents(tree).some((item) => item.includes("Done task")),
				() =>
					`search filter (search=${JSON.stringify(search?.getValue?.())}, items=${itemContents(tree).length}, content=${JSON.stringify(itemContents(tree))})`,
			);
			expect(tree?.items).not.toContain(obsoleteDoneItem);
			expect(tree?.children).not.toContain(obsoleteDoneItem);
			expect(calls).toEqual({ input: 0, resetSize: 1 });

			status?.emit("click", { button: "left", x: 0, y: 0 });
			await settleFocus();
			const picker = (screen as unknown as { focused?: Widget }).focused;
			expect(itemContents(picker)).toContain("[ ] To Do");
			press(picker as Widget, screen, "space", " ");
			press(picker as Widget, screen, "enter", "\r");
			await waitUntil(() => status?.content === "To Do ▼", "status selection");
			expect(itemContents(tree)).toEqual(expect.arrayContaining([expect.stringContaining("Matching task")]));
			expect(itemContents(tree).join("\n")).not.toContain("Done task");

			press(search as Widget, screen, "escape", "\x1b");
			press(screen, screen, "q", "q");
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("clears task session panes on group selection and ignores delayed prior task data", async () => {
		const directory = createUniqueTestDir("agent-workspace-selection");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		let resolveSecond: ((sessions: TaskSessions) => void) | undefined;
		let handoffs = 0;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace selection");
			await core.createTaskFromInput({ title: "First task", status: "To Do" }, false);
			const second = await core.createTaskFromInput({ title: "Second task", status: "To Do" }, false);
			const service = {
				list: (taskId: string) =>
					taskId === second.task.id
						? new Promise<TaskSessions>((resolve) => {
								resolveSecond = resolve;
							})
						: Promise.resolve({ taskId, activeSessionId: undefined, sessions: [] }),
				preview: async () => "first output",
				requestHandoff: async () => {
					handoffs += 1;
				},
			} as unknown as AgentSessionService;
			const workspace = runAgentWorkspace(core, { screen: screen as never, service });
			await waitUntil(
				() =>
					content(screen.children.find((widget) => widget.options?.label === " Details ")).includes(
						"No active session",
					),
				"initial task session",
			);
			press(screen, screen, "tab", "\t");
			const status = screen.children.find((widget) => content(widget).includes("Start a session first"));
			expect(content(status)).toContain("Start a session first");
			press(screen, screen, "down");
			await waitUntil(() => resolveSecond !== undefined, "second task request");
			const details = screen.children.find((widget) => widget.options?.label === " Details ");
			const preview = screen.children.find((widget) => widget.options?.label === " Live preview ");
			await waitUntil(() => content(details).includes("Second task"), "immediate second task details");
			press(screen, screen, "down");
			await waitUntil(() => content(details) === " In Progress ", "group selection");
			expect(content(preview)).toBe("");
			press(screen, screen, "tab", "\t");
			expect(content(status)).toBe("");
			const footer = screen.children.find((widget) => content(widget).includes("[Tab] Input"));
			expect(content(footer)).toContain("[↑↓] Task");
			press(screen, screen, "h", "h");
			expect(handoffs).toBe(0);
			resolveSecond?.({
				taskId: second.task.id,
				activeSessionId: "second",
				sessions: [{ ...session("second"), taskId: second.task.id }],
			});
			await Bun.sleep(0);
			expect(content(details)).not.toContain("second");
			await Bun.sleep(3100);
			expect(content(status)).toBe("");
			expect(content(footer)).toContain("[Tab] Input");
			press(screen, screen, "q", "q");
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});
});
