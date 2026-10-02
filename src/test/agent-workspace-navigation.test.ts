import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import type { AgentSessionService } from "../agent-workspace/sessions.ts";
import type { AgentSession, TaskSessions } from "../agent-workspace/types.ts";
import { Core } from "../core/backlog.ts";
import { createScreen } from "../ui/tui.ts";
import { AgentWorkspaceController, createWorkspaceViewState } from "../ui/workspace/controller.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

type Widget = {
	children?: Widget[];
	options?: { label?: string };
	selected?: number;
	height?: number;
	hidden?: boolean;
	emit(event: string, ...args: unknown[]): boolean;
	getContent?(): string;
	content?: string;
};
type Host = {
	showBoard(): Promise<void>;
	showAgentSession(taskId: string | undefined, sessionId?: string): Promise<void>;
	focusAgent(zoom: boolean): Promise<void>;
	takeTaskRequest(): Promise<string | undefined>;
	detach(): Promise<void>;
};

function press(screen: Widget, name: string, character = "", ctrl = false): void {
	const key = { name, full: ctrl ? `C-${name}` : name, ctrl };
	screen.emit("keypress", character, key);
	screen.emit(`key ${name}`, character, key);
}
function session(id: string): AgentSession {
	return {
		id,
		taskId: "TASK-1",
		preset: "test",
		presetSnapshot: { command: "", env: {}, prepare: "", worktree: false, bootstrap: "prompt" },
		configScope: "project",
		tmuxName: id,
		cwd: "/tmp",
		createdAt: id,
		status: "running",
		outputPath: "/tmp/output",
		bootstrapPath: "/tmp/bootstrap",
	} as AgentSession;
}
async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
	for (let attempt = 0; attempt < 300; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${message}`);
}

describe("agent workspace native tmux presentation", () => {
	it("clears selection for headers, restores grouped tasks, and expands the task list when Details is hidden", async () => {
		const directory = createUniqueTestDir("workspace-task-navigation");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		const state = createWorkspaceViewState();
		const calls: string[] = [];
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace task navigation");
			await core.createTaskFromInput({ title: "Task", status: "To Do" }, false);
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				state,
				host: {
					showBoard: async () => {},
					showAgentSession: async () => {},
					focusAgent: async () => {
						calls.push("focus");
					},
					focusSearch: async () => {
						calls.push("search");
					},
					takeTaskRequest: async () => undefined,
					detach: async () => {},
				},
				service: {
					list: async (taskId: string) => ({ taskId, sessions: [] }),
					recover: async () => {},
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => state.selectedTaskId !== undefined, "initial task selection");
			const details = screen.children.find((child) => child.options?.label === " Details ") as Widget;
			press(screen, "up");
			await waitUntil(() => state.selectedTaskId === undefined, "header selection clearing the task");
			expect(details.getContent?.()).toContain("No tasks match this filter.");
			press(screen, "enter", "\r");
			await waitUntil(() => state.collapsed.has("To Do"), "group collapse");
			press(screen, "enter", "\r");
			await waitUntil(() => !state.collapsed.has("To Do"), "group expansion");
			press(screen, "down");
			press(screen, "space", " ");
			expect(details.hidden).toBe(true);
			press(screen, "space", " ");
			expect(details.hidden).toBe(false);
			press(screen, "/", "/");
			expect(calls).toContain("search");
			press(screen, "escape", "\u001b");
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("opens a detail field editor for the selected task", async () => {
		const directory = createUniqueTestDir("workspace-detail-editor");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		const state = createWorkspaceViewState();
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace detail editor");
			await core.createTaskFromInput({ title: "Editable", status: "To Do" }, false);
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				state,
				host: {
					showBoard: async () => {},
					showAgentSession: async () => {},
					focusAgent: async () => {},
					takeTaskRequest: async () => undefined,
					detach: async () => {},
				},
				service: {
					list: async (taskId: string) => ({ taskId, sessions: [] }),
					recover: async () => {},
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => state.selectedTaskId !== undefined, "initial task selection");
			press(screen, "right");
			press(screen, "e", "e");
			expect(screen.children.some((child) => child.options?.label?.includes("Title"))).toBe(true);
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("clears filters and collapsed groups before selecting a native handoff task", async () => {
		const directory = createUniqueTestDir("workspace-handoff-filter-reset");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void };
		const state = createWorkspaceViewState();
		state.filters.search = "not this task";
		state.collapsed.add("To Do");
		let requestedTaskId: string | undefined;
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace handoff filter reset");
			const { task } = await core.createTaskFromInput({ title: "Requested", status: "To Do" }, false);
			requestedTaskId = task.id;
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				state,
				host: {
					showBoard: async () => {},
					showAgentSession: async () => {},
					focusAgent: async () => {},
					takeTaskRequest: async () => {
						const request = requestedTaskId;
						requestedTaskId = undefined;
						return request;
					},
					detach: async () => {},
				},
				service: {
					list: async (taskId: string) => ({ taskId, sessions: [] }),
					recover: async () => {},
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => state.selectedTaskId === task.id, "handoff task selection");
			expect(state.filters.search).toBe("");
			expect(state.collapsed.size).toBe(0);
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("does not focus a session that finished starting after selection changed", async () => {
		const directory = createUniqueTestDir("workspace-selection-guard");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void };
		const state = createWorkspaceViewState();
		const calls: string[] = [];
		let resolveStart: ((session: AgentSession) => void) | undefined;
		const started = new Promise<AgentSession>((resolve) => {
			resolveStart = resolve;
		});
		const sessions: Record<string, TaskSessions> = {
			"TASK-1": { taskId: "TASK-1", sessions: [] },
			"TASK-2": { taskId: "TASK-2", sessions: [] },
		};
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace selection guard");
			await core.createTaskFromInput({ title: "First", status: "To Do" }, false);
			await core.createTaskFromInput({ title: "Second", status: "To Do" }, false);
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				state,
				host: {
					showBoard: async () => {},
					showAgentSession: async (taskId, sessionId) => {
						calls.push(`show:${taskId}:${sessionId}`);
					},
					focusAgent: async () => {
						calls.push("focus");
					},
					takeTaskRequest: async () => undefined,
					detach: async () => {},
				},
				service: {
					list: async (taskId: string) => sessions[taskId] ?? { taskId, sessions: [] },
					recover: async () => {},
					start: async () => await started,
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => state.selectedTaskId === "TASK-1", "initial task selection");
			press(screen, "enter", "\r");
			press(screen, "down");
			resolveStart?.(session("late"));
			await Bun.sleep(30);
			expect(calls).not.toContain("show:TASK-1:late");
			expect(calls).not.toContain("focus");
			press(screen, "q", "q");
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("recovers selected task sessions before showing native previews", async () => {
		const directory = createUniqueTestDir("workspace-stale-preview-recovery");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void };
		const state = createWorkspaceViewState();
		const events: string[] = [];
		const shown: string[] = [];
		const recovered = new Set<string>();
		const staleByTask = new Map<string, AgentSession>();
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace stale preview recovery");
			const { task: first } = await core.createTaskFromInput({ title: "First", status: "To Do" }, false);
			const { task: second } = await core.createTaskFromInput({ title: "Second", status: "To Do" }, false);
			staleByTask.set(first.id, { ...session("stale-first"), taskId: first.id });
			staleByTask.set(second.id, { ...session("stale-second"), taskId: second.id });
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				state,
				host: {
					showBoard: async () => {},
					showAgentSession: async (taskId, sessionId) => {
						shown.push(`show:${taskId}:${sessionId}`);
					},
					focusAgent: async () => {},
					takeTaskRequest: async () => undefined,
					detach: async () => {},
				},
				service: {
					recover: async (taskId: string) => {
						events.push(`recover:${taskId}`);
						recovered.add(taskId);
					},
					list: async (taskId: string) => {
						const status = recovered.has(taskId) ? "recovered" : "stale";
						events.push(`list:${taskId}:${status}`);
						const stale = staleByTask.get(taskId);
						return recovered.has(taskId) || !stale
							? { taskId, sessions: [] }
							: { taskId, activeSessionId: stale.id, sessions: [stale] };
					},
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => events.includes(`list:${first.id}:recovered`), "initial recovered session list");
			expect(events.indexOf(`recover:${first.id}`)).toBeLessThan(events.indexOf(`list:${first.id}:recovered`));
			expect(shown).not.toContain(`show:${first.id}:stale-first`);
			press(screen, "down");
			await waitUntil(() => state.selectedTaskId === second.id, "second task selection");
			await waitUntil(() => events.includes(`list:${second.id}:recovered`), "second recovered session list");
			expect(events.indexOf(`recover:${second.id}`)).toBeLessThan(events.indexOf(`list:${second.id}:recovered`));
			expect(shown).not.toContain(`show:${second.id}:stale-second`);
			press(screen, "q", "q");
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("selects stable panes, starts sessions, and delegates real-agent focus to the host", async () => {
		const directory = createUniqueTestDir("workspace-native-host");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		const calls: Array<string> = [];
		const active = session("active");
		const sessions: TaskSessions = { taskId: "TASK-1", activeSessionId: active.id, sessions: [active] };
		const host: Host = {
			showBoard: async () => {
				calls.push("board");
			},
			showAgentSession: async (taskId, sessionId) => {
				calls.push(`show:${taskId}:${sessionId}`);
			},
			focusAgent: async (zoom) => {
				calls.push(`focus:${zoom}`);
			},
			takeTaskRequest: async () => undefined,
			detach: async () => {
				calls.push("detach");
			},
		};
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace native host");
			await core.createTaskFromInput({ title: "Task", status: "To Do" }, false);
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				host,
				service: {
					list: async () => sessions,
					recover: async () => {},
					start: async () => active,
					touchUsage: async () => {},
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => calls.includes("show:TASK-1:active"), "initial pane selection");
			press(screen, "enter", "\r");
			await waitUntil(() => calls.includes("focus:true"), "zoomed agent focus");
			press(screen, "tab", "\t");
			await waitUntil(() => calls.includes("focus:false"), "inline agent focus");
			screen.emit("keypress", "B", { name: "b", full: "S-b", shift: true });
			await waitUntil(() => calls.includes("board"), "board selection");
			press(screen, "q", "q");
			await Bun.sleep(20);
			expect(screen.children.length).toBeGreaterThan(0);
			expect(calls).toContain("detach");
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("detaches instead of closing the native navigation region on q", async () => {
		const directory = createUniqueTestDir("workspace-nav-detach");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void };
		const calls: string[] = [];
		const host: Host = {
			showBoard: async () => {},
			showAgentSession: async () => {},
			focusAgent: async () => {},
			takeTaskRequest: async () => undefined,
			detach: async () => {
				calls.push("detach");
			},
		};
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace nav detach");
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				host,
				region: "workspace-nav",
			}).run();
			await waitUntil(() => Boolean(screen.children?.length), "navigation region render");
			press(screen, "q", "q");
			await waitUntil(() => calls.includes("detach"), "navigation detach");
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});

	it("shows a running session by task/session identity", async () => {
		const directory = createUniqueTestDir("workspace-missing-pane");
		const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false }) as unknown as Widget & { destroy(): void; children: Widget[] };
		const calls: string[] = [];
		const touches: string[] = [];
		const host: Host = {
			showBoard: async () => {},
			showAgentSession: async (taskId, sessionId) => {
				calls.push(`${taskId}:${sessionId}`);
			},
			focusAgent: async () => {},
			takeTaskRequest: async () => undefined,
			detach: async () => {},
		};
		try {
			await mkdir(directory, { recursive: true });
			const core = new Core(directory);
			await initializeTestProject(core, "Workspace missing pane");
			await core.createTaskFromInput({ title: "Task", status: "To Do" }, false);
			const current = session("active");
			const workspace = new AgentWorkspaceController(core, {
				screen: screen as never,
				host,
				service: {
					list: async () => ({ taskId: "TASK-1", activeSessionId: current.id, sessions: [current] }),
					recover: async () => {},
					touchUsage: async (taskId: string, sessionId: string) => {
						touches.push(`${taskId}:${sessionId}`);
					},
				} as unknown as AgentSessionService,
			}).run();
			await waitUntil(() => calls.includes("TASK-1:active"), "running session display");
			press(screen, "enter", "\r");
			await Bun.sleep(20);
			expect(calls).toContain("undefined:undefined");
			expect(calls).toContain("TASK-1:active");
			expect(touches).toContain("TASK-1:active");
			press(screen, "q", "q");
			screen.destroy();
			await workspace;
		} finally {
			screen.destroy();
			if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
			else Reflect.deleteProperty(process.stdout, "isTTY");
			await safeCleanup(directory);
		}
	});
});
