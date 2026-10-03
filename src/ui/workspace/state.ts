import type { FilterState } from "../components/filter-header.ts";
import type { WorkspaceDraft } from "./model.ts";

export type WorkspaceViewState = {
	drafts: Map<string, WorkspaceDraft>;
	scrolls: Map<string, number>;
	filters: FilterState;
	collapsed: Set<string>;
	detailsVisible: boolean;
	selectedTaskId?: string;
};

export type SharedWorkspaceState = Pick<WorkspaceViewState, "filters" | "selectedTaskId" | "detailsVisible"> & {
	footerEditing?: boolean;
	footerContext?: "tasks" | "details" | "history" | "output";
	footerMessage?: string;
};

export function createWorkspaceFilters(): FilterState {
	return { search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" };
}

export function createWorkspaceViewState(): WorkspaceViewState {
	return {
		drafts: new Map(),
		scrolls: new Map(),
		filters: createWorkspaceFilters(),
		collapsed: new Set(),
		detailsVisible: true,
	};
}

export function withWorkspaceSearch(filters: FilterState, search: string): FilterState {
	return { ...filters, search };
}
