import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Task } from "../../types";
import Board from "./Board";
import TaskCard from "./TaskCard";

let activeDom: JSDOM | null = null;
let activeRoot: Root | null = null;

const task: Task = {
	id: "BACK-1",
	title: "Keyboard shortcuts",
	status: "To Do",
	assignee: [],
	createdDate: "2026-09-29",
	labels: [],
	dependencies: [],
	references: [],
};

function setupDom(): HTMLElement {
	activeDom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost",
	});
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = activeDom.window as unknown as Window & typeof globalThis;
	globalThis.document = activeDom.window.document as Document;
	globalThis.navigator = activeDom.window.navigator as Navigator;
	globalThis.Element = activeDom.window.Element;
	globalThis.HTMLElement = activeDom.window.HTMLElement;
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
	globalThis.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
	return document.getElementById("root") as HTMLElement;
}

async function mount(element: React.ReactNode): Promise<HTMLElement> {
	const container = setupDom();
	activeRoot = createRoot(container);
	await act(async () => {
		activeRoot?.render(element);
		await Promise.resolve();
	});
	return container;
}

async function dispatchKey(target: EventTarget, key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
	const event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init });
	await act(async () => {
		target.dispatchEvent(event);
		await Promise.resolve();
	});
	return event;
}

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
	activeDom?.window.close();
	activeDom = null;
});

describe("browser shortcut dispatch", () => {
	it("remaps configured card shortcuts through the rendered handler", async () => {
		let edits = 0;
		let selections = 0;
		const container = await mount(
			<TaskCard
				task={task}
				onUpdate={() => {}}
				onEdit={() => {
					edits += 1;
				}}
				onSelect={() => {
					selections += 1;
				}}
			/>,
		);
		const card = container.querySelector("[role='button']");
		expect(card).toBeTruthy();
		expect(card?.getAttribute("aria-keyshortcuts")).toBe("Enter Space");

		const selectEvent = await dispatchKey(card as Element, "Enter", { shiftKey: true });
		const editEvent = await dispatchKey(card as Element, "Enter");

		expect(selectEvent.defaultPrevented).toBe(true);
		expect(editEvent.defaultPrevented).toBe(true);
		expect(selections).toBe(1);
		expect(edits).toBe(1);
	});

	it("leaves Escape for editable targets and owns it elsewhere when selection is active", async () => {
		const container = await mount(
			<Board
				onEditTask={() => {}}
				onNewTask={() => {}}
				tasks={[task]}
				statuses={["To Do"]}
				isLoading={false}
				milestones={[]}
				availableLabels={[]}
				milestoneEntities={[]}
				archivedMilestones={[]}
				laneMode="none"
				onLaneChange={() => {}}
			/>,
		);
		const card = container.querySelector("[role='button']");
		expect(card).toBeTruthy();
		await act(async () => {
			card?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, ctrlKey: true }));
			await Promise.resolve();
		});
		expect(container.querySelector("[aria-label='Task selection']")).toBeTruthy();

		const input = document.createElement("input");
		document.body.appendChild(input);
		const editableEscape = await dispatchKey(input, "Escape");
		expect(editableEscape.defaultPrevented).toBe(false);
		expect(container.querySelector("[aria-label='Task selection']")).toBeTruthy();

		const boardEscape = await dispatchKey(document.body, "Escape");
		expect(boardEscape.defaultPrevented).toBe(true);
		expect(container.querySelector("[aria-label='Task selection']")).toBeNull();
	});
});
