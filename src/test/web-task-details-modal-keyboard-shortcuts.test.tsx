import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { Task } from "../types/index.ts";
import { TaskDetailsModal } from "../web/components/TaskDetailsModal";
import { ThemeProvider } from "../web/contexts/ThemeContext";
import { apiClient } from "../web/lib/api.ts";
import { BROWSER_SHORTCUTS } from "../web/lib/keyboard-shortcuts.ts";

let activeRoot: Root | null = null;
let activeDom: JSDOM | null = null;

const task: Task = {
	id: "BACK-558",
	title: "Keyboard shortcut task",
	status: "To Do",
	assignee: [],
	createdDate: "2026-07-30",
	labels: [],
	dependencies: [],
	references: [],
};

const setupDom = () => {
	activeDom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost",
	});
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = activeDom.window as unknown as Window & typeof globalThis;
	globalThis.document = activeDom.window.document as Document;
	globalThis.navigator = activeDom.window.navigator as Navigator;
	globalThis.localStorage = activeDom.window.localStorage;
	globalThis.Element = activeDom.window.Element;
	globalThis.HTMLElement = activeDom.window.HTMLElement;
	globalThis.HTMLInputElement = activeDom.window.HTMLInputElement;
	globalThis.HTMLTextAreaElement = activeDom.window.HTMLTextAreaElement;
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
	globalThis.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);

	window.matchMedia = () =>
		({
			matches: false,
			media: "",
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;

	const htmlElementPrototype = window.HTMLElement.prototype as unknown as {
		attachEvent?: () => void;
		detachEvent?: () => void;
	};
	htmlElementPrototype.attachEvent = () => {};
	htmlElementPrototype.detachEvent = () => {};
};

const mountModal = async (
	modalTask: Task = task,
	isOpen = true,
	props: { availableStatuses?: string[]; onArchive?: () => void; onClose?: () => void; onSaved?: () => void } = {},
): Promise<HTMLElement> => {
	setupDom();
	const container = document.getElementById("root");
	expect(container).toBeTruthy();
	activeRoot = createRoot(container as HTMLElement);
	await act(async () => {
		activeRoot?.render(
			<ThemeProvider>
				<TaskDetailsModal task={modalTask} isOpen={isOpen} onClose={() => {}} {...props} />
			</ThemeProvider>,
		);
		await Promise.resolve();
	});
	return container as HTMLElement;
};

const findButton = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
	Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));

const press = async (element: Element, key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> => {
	const event = new window.KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...init,
	});
	await act(async () => {
		(element as HTMLElement).focus();
		element.dispatchEvent(event);
		await Promise.resolve();
	});
	return event;
};

const click = async (element: Element) => {
	await act(async () => {
		element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		await Promise.resolve();
	});
};

const waitFor = async (predicate: () => boolean) => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (predicate()) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
};

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
	activeDom?.window.close();
	activeDom = null;
});

describe("Web task popup keyboard shortcuts", () => {
	it("does not fetch dependency tasks while the modal is closed", async () => {
		const originalFetchTasks = apiClient.fetchTasks.bind(apiClient);
		let fetchCount = 0;
		apiClient.fetchTasks = async () => {
			fetchCount += 1;
			return [];
		};
		try {
			await mountModal(task, false);
			expect(fetchCount).toBe(0);
		} finally {
			apiClient.fetchTasks = originalFetchTasks;
		}
	});

	it("leaves e and E available to every preview editor", async () => {
		const container = await mountModal();
		const dialog = container.querySelector("[role='dialog']");
		expect(dialog).toBeTruthy();
		const contentEditable = document.createElement("div");
		contentEditable.setAttribute("contenteditable", "true");
		const contentEditableChild = document.createElement("span");
		contentEditable.append(contentEditableChild);
		(dialog as HTMLElement).append(contentEditable);

		const targets: Array<[string, Element | undefined | null, string]> = [
			["reference", container.querySelector("input[name='newRef']"), "e"],
			["assignee", container.querySelector("#chip-input-assignee"), "e"],
			["label", container.querySelector("#chip-input-labels"), "E"],
			[
				"title",
				Array.from(container.querySelectorAll("input")).find((input) => input.value === task.title),
				"e",
			],
			["dependency", container.querySelector("#dependency-input"), "e"],
			["select", container.querySelector("select"), "e"],
			["content editable descendant", contentEditableChild, "e"],
		];

		for (const [name, target, key] of targets) {
			expect(target, `${name} target`).toBeTruthy();
			const event = await press(target as Element, key);
			expect(event.defaultPrevented, `${name} keydown`).toBe(false);
			expect(findButton(container, "Edit"), `${name} keeps preview mode`).toBeTruthy();
		}
	});

	it("leaves c available to preview editors on Done tasks", async () => {
		const container = await mountModal({ ...task, status: "Done" });
		window.confirm = () => false;
		const referenceInput = container.querySelector("input[name='newRef']");
		expect(referenceInput).toBeTruthy();

		const event = await press(referenceInput as Element, "c");

		expect(event.defaultPrevented).toBe(false);
		expect(findButton(container, "Edit")).toBeTruthy();
	});

	it.each(["Done", "Closed"])("keeps completion active for the configured final status %s", async (status) => {
		const originalCompleteTask = apiClient.completeTask.bind(apiClient);
		const completedTaskIds: string[] = [];
		apiClient.completeTask = async (taskId) => {
			completedTaskIds.push(taskId);
		};
		try {
			const container = await mountModal({ ...task, status }, true, { availableStatuses: ["To Do", status] });
			expect(findButton(container, "Move to completed")).toBeTruthy();
			window.confirm = (message) => {
				expect(message).toContain("off the board to completed storage");
				expect(message).toContain("record and dependency links will be preserved");
				return true;
			};
			const dialog = container.querySelector("[role='dialog']");
			expect(dialog).toBeTruthy();

			const event = await press(dialog as Element, "c");
			await waitFor(() => completedTaskIds.length > 0);

			expect(event.defaultPrevented).toBe(true);
			expect(completedTaskIds).toEqual(["BACK-558"]);
		} finally {
			apiClient.completeTask = originalCompleteTask;
		}
	});

	it("does not close the replacement task after completion refreshes it", async () => {
		const originalCompleteTask = apiClient.completeTask.bind(apiClient);
		let releaseSaved: (() => void) | undefined;
		let markSaved: (() => void) | undefined;
		const savedStarted = new Promise<void>((resolve) => {
			markSaved = resolve;
		});
		const savedRelease = new Promise<void>((resolve) => {
			releaseSaved = resolve;
		});
		let closeCalls = 0;
		const replacement = { ...task, id: "BACK-559", title: "Replacement task", status: "Done" };
		apiClient.completeTask = async () => {};
		try {
			const container = await mountModal({ ...task, status: "Done" }, true, {
				onClose: () => closeCalls++,
				onSaved: async () => {
					flushSync(() => {
						activeRoot?.render(<ThemeProvider><TaskDetailsModal task={replacement} isOpen onClose={() => closeCalls++} /></ThemeProvider>);
					});
					markSaved?.();
					await savedRelease;
				},
			});
			window.confirm = () => true;
			await click(findButton(container, "Move to completed") as HTMLButtonElement);
			await savedStarted;
			expect(container.textContent).toContain("BACK-559 — Replacement task");
			releaseSaved?.();
			await act(async () => {
				await savedRelease;
			});

			expect(closeCalls).toBe(0);
		} finally {
			releaseSaved?.();
			apiClient.completeTask = originalCompleteTask;
		}
	});

	it("ignores a deferred save after closing and reopening the same task", async () => {
		const originalUpdateTask = apiClient.updateTask.bind(apiClient);
		let releaseUpdate: (() => void) | undefined;
		let markStarted: (() => void) | undefined;
		const updateStarted = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const updateRelease = new Promise<void>((resolve) => {
			releaseUpdate = resolve;
		});
		let savedCalls = 0;
		apiClient.updateTask = async () => {
			markStarted?.();
			await updateRelease;
			return task;
		};
		try {
			const container = await mountModal(task, true, { onSaved: () => savedCalls++ });
			await click(findButton(container, "Edit") as HTMLButtonElement);
			const title = Array.from(container.querySelectorAll("input")).find((input) => input.value === task.title);
			expect(title).toBeTruthy();
			await act(async () => {
				const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
				setValue?.call(title, "Pending title");
				title?.dispatchEvent(new window.Event("input", { bubbles: true }));
				await Promise.resolve();
			});
			await click(findButton(container, "Save") as HTMLButtonElement);
			await updateStarted;

			await act(async () => {
				flushSync(() => {
					activeRoot?.render(<ThemeProvider><TaskDetailsModal task={task} isOpen={false} onClose={() => {}} /></ThemeProvider>);
				});
				flushSync(() => {
					activeRoot?.render(<ThemeProvider><TaskDetailsModal task={task} isOpen onClose={() => {}} /></ThemeProvider>);
				});
				await Promise.resolve();
			});
			await click(findButton(container, "Edit") as HTMLButtonElement);
			expect(findButton(container, "Save")).toBeTruthy();

			releaseUpdate?.();
			await act(async () => {
				await updateRelease;
			});

			expect(savedCalls).toBe(0);
			expect(findButton(container, "Save")).toBeTruthy();
		} finally {
			releaseUpdate?.();
			apiClient.updateTask = originalUpdateTask;
		}
	});

	it("ignores a deferred completion response after unmount", async () => {
		const originalCompleteTask = apiClient.completeTask.bind(apiClient);
		let release: (() => void) | undefined;
		let started: (() => void) | undefined;
		const requestStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const requestRelease = new Promise<void>((resolve) => {
			release = resolve;
		});
		let savedCalls = 0;
		let closeCalls = 0;
		apiClient.completeTask = async () => {
			started?.();
			await requestRelease;
		};
		try {
			const container = await mountModal({ ...task, status: "Done" }, true, {
				onClose: () => closeCalls++,
				onSaved: () => savedCalls++,
			});
			window.confirm = () => true;
			await click(findButton(container, "Move to completed") as HTMLButtonElement);
			await requestStarted;
			act(() => activeRoot?.unmount());
			activeRoot = null;
			release?.();
			await act(async () => {
				await requestRelease;
			});

			expect(savedCalls).toBe(0);
			expect(closeCalls).toBe(0);
		} finally {
			release?.();
			apiClient.completeTask = originalCompleteTask;
		}
	});

	it("does not offer completion for a nonfinal status containing Done", async () => {
		const container = await mountModal({ ...task, status: "Not Done" }, true, {
			availableStatuses: ["Not Done", "Closed"],
		});
		expect(findButton(container, "Move to completed")).toBeUndefined();
		const event = await press(container.querySelector("[role='dialog']") as Element, "c");
		expect(event.defaultPrevented).toBe(false);
	});

	it("explains archive purpose and link removal before running the action", async () => {
		let archives = 0;
		const container = await mountModal(task, true, {
			onArchive: () => {
				archives += 1;
			},
		});
		const archive = findButton(container, "Archive Task");
		expect(archive).toBeTruthy();
		window.confirm = (message) => {
			expect(message).toContain("canceled, duplicate, or invalid work");
			expect(message).toContain("Incoming dependencies and task references will be removed");
			return false;
		};
		await click(archive as HTMLButtonElement);
		expect(archives).toBe(0);
		window.confirm = () => true;
		await click(archive as HTMLButtonElement);
		expect(archives).toBe(1);
	});

	it("keeps e and E shortcuts active outside editable controls", async () => {
		for (const key of ["e", "E"]) {
			const container = await mountModal();
			const dialog = container.querySelector("[role='dialog']");
			expect(dialog).toBeTruthy();

			const event = await press(dialog as Element, key);

			expect(event.defaultPrevented).toBe(true);
			expect(findButton(container, "Save")).toBeTruthy();

			act(() => {
				activeRoot?.unmount();
			});
			activeRoot = null;
			activeDom?.window.close();
			activeDom = null;
		}
	});

	it("uses the mutable edit shortcut configuration for its control hint and handler", async () => {
		const originalKeys = BROWSER_SHORTCUTS.startTaskEdit.keys;
		const originalLabel = BROWSER_SHORTCUTS.startTaskEdit.label;
		BROWSER_SHORTCUTS.startTaskEdit.keys = ["r"];
		BROWSER_SHORTCUTS.startTaskEdit.label = "R";
		try {
			const container = await mountModal();
			const editButton = findButton(container, "Edit");
			expect(editButton?.getAttribute("title")).toBe("Edit (R)");
			expect(editButton?.getAttribute("aria-keyshortcuts")).toBe("r");

			const dialog = container.querySelector("[role='dialog']");
			expect(dialog).toBeTruthy();
			expect((await press(dialog as Element, "e")).defaultPrevented).toBe(false);
			expect((await press(dialog as Element, "r")).defaultPrevented).toBe(true);
			expect(findButton(container, "Save")).toBeTruthy();
		} finally {
			BROWSER_SHORTCUTS.startTaskEdit.keys = originalKeys;
			BROWSER_SHORTCUTS.startTaskEdit.label = originalLabel;
		}
	});

	it("does not roll back a replacement task when an earlier metadata request fails", async () => {
		const originalUpdateTask = apiClient.updateTask.bind(apiClient);
		let rejectUpdate: ((reason?: unknown) => void) | undefined;
		apiClient.updateTask = () => new Promise<Task>((_, reject) => {
			rejectUpdate = reject;
		});
		try {
			const container = await mountModal();
			const title = Array.from(container.querySelectorAll("input")).find((input) => input.value === task.title);
			expect(title).toBeTruthy();
			await act(async () => {
				const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
				setValue?.call(title, "Optimistic title");
				(title as HTMLInputElement).focus();
				title?.dispatchEvent(new window.Event("input", { bubbles: true }));
				(title as HTMLInputElement).blur();
				await Promise.resolve();
			});
			await waitFor(() => Boolean(rejectUpdate));
			const replacement = { ...task, id: "BACK-559", title: "Replacement task" };
			await act(async () => {
				activeRoot?.render(<ThemeProvider><TaskDetailsModal task={replacement} isOpen onClose={() => {}} /></ThemeProvider>);
				await Promise.resolve();
			});
			await act(async () => {
				rejectUpdate?.(new Error("Request failed"));
				await Promise.resolve();
			});
			expect(Array.from(container.querySelectorAll("input")).some((input) => input.value === replacement.title)).toBe(true);
			expect(container.textContent).not.toContain("Request failed");
		} finally {
			apiClient.updateTask = originalUpdateTask;
		}
	});

	it("keeps Escape active inside full-edit inputs", async () => {
		const container = await mountModal();
		const editButton = findButton(container, "Edit");
		expect(editButton).toBeTruthy();
		await click(editButton as HTMLButtonElement);
		const titleInput = Array.from(container.querySelectorAll("input")).find((input) => input.value === task.title);
		expect(titleInput).toBeTruthy();

		const event = await press(titleInput as HTMLInputElement, "Escape");

		expect(event.defaultPrevented).toBe(true);
		expect(findButton(container, "Edit")).toBeTruthy();
	});

	it("keeps Cmd+S and Ctrl+S active inside full-edit inputs", async () => {
		const originalUpdateTask = apiClient.updateTask.bind(apiClient);
		apiClient.updateTask = async () => task;
		try {
			const container = await mountModal();
			for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
				const editButton = findButton(container, "Edit");
				expect(editButton).toBeTruthy();
				await click(editButton as HTMLButtonElement);
				const titleInput = Array.from(container.querySelectorAll("input")).find(
					(input) => input.value === task.title,
				);
				expect(titleInput).toBeTruthy();

				const event = await press(titleInput as HTMLInputElement, "s", modifier);
				await waitFor(() => Boolean(findButton(container, "Edit")));

				expect(event.defaultPrevented).toBe(true);
				expect(findButton(container, "Edit")).toBeTruthy();
			}
		} finally {
			apiClient.updateTask = originalUpdateTask;
		}
	});
});
