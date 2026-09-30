import type { DuplicateRepairPlan } from "../../core/duplicate-task-repair";
import type { Milestone, SearchResult, Task } from "../../types";
import { apiClient } from "../lib/api";

type RefreshState = {
	hasLoadedData: boolean;
	loadError: Error | null;
	pendingScopeRank: number;
	getTasks: () => Task[];
	getMilestones: () => Milestone[];
	getArchivedMilestones: () => Milestone[];
	setMilestones: (milestones: Milestone[], archivedMilestones: Milestone[]) => void;
	applySearchResults: (results: SearchResult[], milestones: Milestone[], archivedMilestones: Milestone[]) => Task[];
	getDuplicateRepairPlan: () => DuplicateRepairPlan | null;
	applyDuplicateRepairPlan: (plan: DuplicateRepairPlan | null) => void;
	loadAllData: () => Promise<void>;
	isRequestCurrent: () => boolean;
};

function shouldRefreshDuplicateRepairPlan(plan: DuplicateRepairPlan | null, tasks: Task[], previousTaskIds: string) {
	return (
		plan === null ||
		plan.groups.length > 0 ||
		plan.crossBranchFindings.length > 0 ||
		tasks
			.map((task) => task.id)
			.sort()
			.join("\n") !== previousTaskIds
	);
}

async function fetchRefreshData(includeMilestones: boolean, state: RefreshState) {
	return Promise.all([
		includeMilestones ? apiClient.fetchMilestones() : state.getMilestones(),
		includeMilestones ? apiClient.fetchArchivedMilestones() : state.getArchivedMilestones(),
		apiClient.search(),
	]);
}

async function refreshDuplicateRepairPlan(requestIsCurrent: () => boolean, state: RefreshState) {
	try {
		const plan = await apiClient.fetchDuplicateTaskRepairPlan();
		if (requestIsCurrent()) state.applyDuplicateRepairPlan(plan);
	} catch {
		// A later full load will retry; retain the known plan while this refresh is incomplete.
	}
}

export async function refreshAppData(includeMilestones: boolean, state: RefreshState) {
	if (!state.hasLoadedData || state.loadError) return state.loadAllData();
	if (state.pendingScopeRank >= 2) return state.loadAllData();

	const withMilestones = includeMilestones || state.pendingScopeRank >= 1;
	const previousTaskIds = state
		.getTasks()
		.map((task) => task.id)
		.sort()
		.join("\n");
	const data = await fetchRefreshData(withMilestones, state);
	applyRefreshData(data, withMilestones, previousTaskIds, state);
}

function applyRefreshData(
	[milestones, archivedMilestones, results]: Awaited<ReturnType<typeof fetchRefreshData>>,
	withMilestones: boolean,
	previousTaskIds: string,
	state: RefreshState,
) {
	if (!state.isRequestCurrent()) return;
	if (withMilestones) state.setMilestones(milestones, archivedMilestones);
	const tasks = state.applySearchResults(results, milestones, archivedMilestones);
	if (shouldRefreshDuplicateRepairPlan(state.getDuplicateRepairPlan(), tasks, previousTaskIds)) {
		void refreshDuplicateRepairPlan(state.isRequestCurrent, state);
	}
}
