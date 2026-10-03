import { isTmuxWorkspace } from "../../agent-workspace/tmux-workspace.ts";
import { formatKeymap } from "../keymap.ts";
import type { SharedWorkspaceState } from "./state.ts";

export type WorkspaceMode = "navigation" | "details" | "field" | "history" | "output" | "config" | "composer";

// Built on demand: the keymap is remappable at runtime, so bindings must not be snapshotted at import time.
function workspaceFooterContent(context: NonNullable<SharedWorkspaceState["footerContext"]>): string {
	switch (context) {
		case "details":
			return ` [${formatKeymap("workspace", "edit")}] Edit | [${formatKeymap("workspace", "history")}] Sessions | [${formatKeymap("workspace", "close")}] Tasks `;
		case "history":
			return ` [${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}] Session | [${formatKeymap("workspace", "open")}] Open | [${formatKeymap("workspace", "close")}] Details `;
		case "output":
			return ` [${formatKeymap("shared", "up")}${formatKeymap("shared", "down")}] Scroll | [${formatKeymap("workspace", "close")}] Sessions `;
		default:
			return ` [${formatKeymap("workspace", "up")}${formatKeymap("workspace", "down")}] Task | [${formatKeymap("workspace", "search")}] Search | [${formatKeymap("workspace", "details")}] Details | [${formatKeymap("workspace", "focusDetails")}] Focus details | [${formatKeymap("workspace", "inlineInput")}] Agent | [${formatKeymap("workspace", "open")}] Start/Show | [${formatKeymap("workspace", "newTask")}] New | [${formatKeymap("workspace", "board")}] Board | [${formatKeymap("shared", "quitWithoutEscape")}] ${quitHint()} `;
	}
}

/** Inside tmux the quit key tears the workspace down and returns to the previous session; outside it only detaches. */
function quitHint(): string {
	return isTmuxWorkspace() ? "Back" : "Close";
}

const FOOTER_CONTEXT_BY_MODE: Partial<Record<WorkspaceMode, NonNullable<SharedWorkspaceState["footerContext"]>>> = {
	details: "details",
	history: "history",
	output: "output",
};

export function workspaceFooterContext(mode: WorkspaceMode): NonNullable<SharedWorkspaceState["footerContext"]> {
	return FOOTER_CONTEXT_BY_MODE[mode] ?? "tasks";
}

export function getWorkspaceFooterContent(context: SharedWorkspaceState["footerContext"], search = ""): string {
	const query = search ? ` | {yellow-fg}Search: ${search}{/}` : "";
	return `${workspaceFooterContent(context ?? "tasks")}${query}`;
}

export function escapeBlessedTags(text: string): string {
	return text.replace(/[{}]/g, (brace) => (brace === "{" ? "{open}" : "{close}"));
}

export function createLatestWorkspaceSearchPublisher(publish: (search: string) => Promise<void>) {
	let latest: string | undefined;
	let running = false;
	let pending = Promise.resolve();
	const submit = (search: string) => {
		latest = search;
		if (running) return pending;
		running = true;
		pending = pending
			.catch(() => {})
			.then(async () => {
				while (latest !== undefined) {
					const next = latest;
					latest = undefined;
					await publish(next);
				}
			})
			.finally(() => {
				running = false;
			});
		return pending;
	};
	return { submit, flush: () => pending };
}
