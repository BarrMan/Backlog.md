import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { Task } from "../types/index.ts";
import { TaskIdIndexProvider } from "../web/contexts/TaskIdIndexContext.tsx";
import { ThemeProvider } from "../web/contexts/ThemeContext.tsx";
import { TaskModalLifecycle } from "../web/features/app/TaskModalLifecycle.tsx";
import type { TaskModalState } from "../web/hooks/task-route-modal.ts";
import { apiClient } from "../web/lib/api.ts";
import { setNativeInputValue } from "./react-dom-input.ts";

let activeRoot: Root | null = null;
let activeDom: JSDOM | null = null;

const task = (id: string, title: string): Task => ({
	id,
	title,
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-09-29",
});

const setupDom = () => {
	activeDom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost",
	});
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = activeDom.window as unknown as Window & typeof globalThis;
	globalThis.document = activeDom.window.document;
	globalThis.navigator = activeDom.window.navigator;
	globalThis.localStorage = activeDom.window.localStorage;
	globalThis.Element = activeDom.window.Element;
	globalThis.HTMLElement = activeDom.window.HTMLElement;
	globalThis.HTMLInputElement = activeDom.window.HTMLInputElement;
	globalThis.HTMLTextAreaElement = activeDom.window.HTMLTextAreaElement;
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
	globalThis.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
	window.matchMedia = () =>
		({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
	window.confirm = () => true;
};

const render = async (modal: TaskModalState, refreshData: () => Promise<void>, onClose: () => void) => {
	await act(async () => {
		activeRoot?.render(
			<MemoryRouter>
				<ThemeProvider>
					<TaskIdIndexProvider tasks={[task("BACK-1", "First"), task("BACK-2", "Second")]}>
						<TaskModalLifecycle
							modal={modal}
							closeModal={onClose}
							tasks={[task("BACK-1", "First"), task("BACK-2", "Second")]}
							statuses={["To Do", "Done"]}
							milestones={[]}
							milestoneEntities={[]}
							archivedMilestones={[]}
							config={null}
							availableTypes={[]}
							availableProjects={[]}
							onNavigateToTask={() => {}}
							refreshData={refreshData}
						/>
					</TaskIdIndexProvider>
				</ThemeProvider>
			</MemoryRouter>,
		);
		await Promise.resolve();
	});
};

const click = async (element: Element) => {
	await act(async () => {
		element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
		await Promise.resolve();
	});
};

const button = (container: HTMLElement, label: string) => {
	const element = Array.from(container.querySelectorAll("button")).find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	expect(element, `button ${label}`).toBeTruthy();
	return element as HTMLButtonElement;
};

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
	activeDom?.window.close();
	activeDom = null;
});

describe("task modal lifecycle", () => {
	it("refreshes a stale create without closing or confirming the replacement create session", async () => {
		setupDom();
		const container = document.getElementById("root") as HTMLElement;
		activeRoot = createRoot(container);
		let releaseCreate = () => {};
		let markCreateStarted = () => {};
		const createStarted = new Promise<void>((resolve) => {
			markCreateStarted = resolve;
		});
		const createReleased = new Promise<void>((resolve) => {
			releaseCreate = resolve;
		});
		const originalCreate = apiClient.createTask.bind(apiClient);
		let refreshes = 0;
		let closes = 0;
		apiClient.createTask = async () => {
			markCreateStarted();
			await createReleased;
			return task("BACK-3", "Created task");
		};
		try {
			await render(
				{ kind: "create", session: 1, isDraft: false },
				async () => {
					refreshes += 1;
				},
				() => closes++,
			);
			const title = container.querySelector('input[placeholder="Enter task title"]') as HTMLInputElement;
			expect(title).toBeTruthy();
			await act(async () => setNativeInputValue(title, "First create"));
			await click(button(container, "Create"));
			await createStarted;

			await render(
				{ kind: "create", session: 2, isDraft: true },
				async () => {
					refreshes += 1;
				},
				() => closes++,
			);
			releaseCreate();
			await act(async () => await createReleased);

			expect(refreshes).toBe(1);
			expect(closes).toBe(0);
			expect(container.textContent).not.toContain('Created task" created successfully');
			expect(container.querySelector("[role='dialog']")).toBeTruthy();
		} finally {
			releaseCreate();
			apiClient.createTask = originalCreate;
		}
	});

	it("refreshes a stale archive without closing or notifying the replacement detail session", async () => {
		setupDom();
		const container = document.getElementById("root") as HTMLElement;
		activeRoot = createRoot(container);
		let releaseArchive = () => {};
		let markArchiveStarted = () => {};
		const archiveStarted = new Promise<void>((resolve) => {
			markArchiveStarted = resolve;
		});
		const archiveReleased = new Promise<void>((resolve) => {
			releaseArchive = resolve;
		});
		const originalArchive = apiClient.archiveTask.bind(apiClient);
		let refreshes = 0;
		let closes = 0;
		apiClient.archiveTask = async () => {
			markArchiveStarted();
			await archiveReleased;
			return { success: true, cleanedTaskIds: ["BACK-9"] };
		};
		try {
			await render(
				{ kind: "detail", session: 1, id: "BACK-1", isDraft: false, fromRoute: false, value: task("BACK-1", "First") },
				async () => {
					refreshes += 1;
				},
				() => closes++,
			);
			await click(button(container, "Archive Task"));
			await archiveStarted;

			await render(
				{ kind: "detail", session: 2, id: "BACK-2", isDraft: false, fromRoute: false, value: task("BACK-2", "Second") },
				async () => {
					refreshes += 1;
				},
				() => closes++,
			);
			releaseArchive();
			await act(async () => await archiveReleased);

			expect(refreshes).toBe(1);
			expect(closes).toBe(0);
			expect(container.textContent).toContain("Second");
			expect(container.textContent).not.toContain("Removed references to BACK-1");
		} finally {
			releaseArchive();
			apiClient.archiveTask = originalArchive;
		}
	});
});
