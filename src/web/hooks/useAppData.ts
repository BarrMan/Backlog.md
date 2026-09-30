import { useCallback, useRef, useState } from "react";
import type { DuplicateRepairPlan } from "../../core/duplicate-task-repair";
import type {
	BacklogConfig,
	Decision,
	DecisionSearchResult,
	Document,
	DocumentSearchResult,
	Milestone,
	SearchResult,
	Task,
	TaskSearchResult,
} from "../../types";
import { apiClient } from "../lib/api";
import { buildMilestoneAliasMap, canonicalizeMilestone } from "../utils/milestone-aliases";
import { collectArchivedMilestoneKeys, collectMilestoneIds, milestoneKey } from "../utils/milestones";
import { reconcileById } from "../utils/reconcile";
import { refreshAppData } from "./app-data-refresh";
import { useAppDataWebSocketEvents } from "./use-app-data-websocket-events";

function createInitialDataController() {
	const searchResults = apiClient.search();
	// Keep the parallel request observed while the shell determines whether it is still current.
	void searchResults.catch(() => {});
	return {
		shellData: Promise.all([
			apiClient.fetchStatuses(),
			apiClient.fetchConfig(),
			apiClient.fetchMilestones(),
			apiClient.fetchArchivedMilestones(),
		]),
		searchResults,
	};
}

export function useAppData() {
	const [dataVersion, setDataVersion] = useState(0);
	const [statuses, setStatuses] = useState<string[]>([]);
	const [availableLabels, setAvailableLabels] = useState<string[]>([]);
	const [projectName, setProjectName] = useState("");
	const [config, setConfig] = useState<BacklogConfig | null>(null);
	const [milestones, setMilestones] = useState<string[]>([]);
	const [milestoneEntities, setMilestoneEntities] = useState<Milestone[]>([]);
	const [archivedMilestones, setArchivedMilestones] = useState<Milestone[]>([]);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [docs, setDocs] = useState<Document[]>([]);
	const [decisions, setDecisions] = useState<Decision[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<Error | null>(null);
	const [duplicateRepairPlan, setDuplicateRepairPlan] = useState<DuplicateRepairPlan | null>(null);
	const tasksRef = useRef<Task[]>([]);
	const docsRef = useRef<Document[]>([]);
	const decisionsRef = useRef<Decision[]>([]);
	const milestoneEntitiesRef = useRef<Milestone[]>([]);
	const archivedMilestonesRef = useRef<Milestone[]>([]);
	const loadAllDataRequestRef = useRef(0);
	const hasLoadedDataRef = useRef(false);
	const pendingDataRequestRef = useRef<number | null>(null);
	const pendingScopeRankRef = useRef(0);
	const loadErrorRef = useRef<Error | null>(null);
	const duplicateRepairPlanRef = useRef<DuplicateRepairPlan | null>(null);
	const protocolOnlyLoadingRef = useRef(false);

	const applySearchResults = useCallback(
		(results: SearchResult[], archivedMilestoneKeys?: Set<string>, milestoneAliases?: Map<string, string>) => {
			const taskResults = results.filter((result): result is TaskSearchResult => result.type === "task");
			const documentResults = results.filter((result): result is DocumentSearchResult => result.type === "document");
			const decisionResults = results.filter((result): result is DecisionSearchResult => result.type === "decision");
			const normalizedTasks = taskResults
				.map((result) => result.task)
				.map((task) => {
					const canonicalMilestone = canonicalizeMilestone(task.milestone, milestoneAliases);
					if (!canonicalMilestone || !archivedMilestoneKeys?.has(milestoneKey(canonicalMilestone))) {
						return task.milestone === canonicalMilestone
							? task
							: { ...task, milestone: canonicalMilestone || undefined };
					}
					return { ...task, milestone: undefined };
				});
			const nextTasks = reconcileById(tasksRef.current, normalizedTasks);
			tasksRef.current = nextTasks;
			setTasks(nextTasks);
			const nextDocs = reconcileById(
				docsRef.current,
				documentResults.map((result) => result.document),
			);
			docsRef.current = nextDocs;
			setDocs(nextDocs);
			const nextDecisions = reconcileById(
				decisionsRef.current,
				decisionResults.map((result) => result.decision),
			);
			decisionsRef.current = nextDecisions;
			setDecisions(nextDecisions);
			setDataVersion((version) => version + 1);
			return { tasks: nextTasks };
		},
		[],
	);

	const applyMilestoneIds = useCallback((next: string[]) => {
		setMilestones((current) =>
			next.length === current.length && next.every((id, index) => id === current[index]) ? current : next,
		);
	}, []);

	const applyLoadError = useCallback((error: Error | null) => {
		loadErrorRef.current = error;
		setLoadError(error);
	}, []);

	const applyDuplicateRepairPlan = useCallback((plan: DuplicateRepairPlan | null) => {
		duplicateRepairPlanRef.current = plan;
		setDuplicateRepairPlan(plan);
	}, []);

	const applyMilestones = useCallback(
		(tasksList: Task[], milestonesData: Milestone[], archivedMilestonesData: Milestone[]) => {
			const archivedKeys = new Set(collectArchivedMilestoneKeys(archivedMilestonesData, milestonesData));
			applyMilestoneIds(
				collectMilestoneIds(tasksList, milestonesData, archivedMilestonesData).filter(
					(milestone) => !archivedKeys.has(milestoneKey(milestone)),
				),
			);
		},
		[applyMilestoneIds],
	);

	const loadAllData = useCallback(async () => {
		const requestId = loadAllDataRequestRef.current + 1;
		loadAllDataRequestRef.current = requestId;
		protocolOnlyLoadingRef.current = false;
		pendingDataRequestRef.current = requestId;
		pendingScopeRankRef.current = 2;
		try {
			if (!hasLoadedDataRef.current) setIsLoading(true);
			applyLoadError(null);
			const initialData = createInitialDataController();
			const [statusesData, configData, milestonesData, archivedMilestonesData] = await initialData.shellData;
			if (loadAllDataRequestRef.current !== requestId) return;
			setStatuses(statusesData);
			setProjectName(configData.projectName);
			setAvailableLabels(configData.labels || []);
			setConfig(configData);
			milestoneEntitiesRef.current = milestonesData;
			archivedMilestonesRef.current = archivedMilestonesData;
			setMilestoneEntities(milestonesData);
			setArchivedMilestones(archivedMilestonesData);
			const searchResults = await initialData.searchResults;
			if (loadAllDataRequestRef.current !== requestId) return;
			const archivedKeys = new Set(collectArchivedMilestoneKeys(archivedMilestonesData, milestonesData));
			const milestoneAliases = buildMilestoneAliasMap(milestonesData, archivedMilestonesData);
			const { tasks: tasksList } = applySearchResults(searchResults, archivedKeys, milestoneAliases);
			hasLoadedDataRef.current = true;
			applyMilestones(tasksList, milestonesData, archivedMilestonesData);
			void apiClient
				.fetchDuplicateTaskRepairPlan()
				.then((plan) => {
					if (loadAllDataRequestRef.current === requestId) applyDuplicateRepairPlan(plan);
				})
				.catch(() => {
					if (loadAllDataRequestRef.current === requestId) applyDuplicateRepairPlan(null);
				});
		} catch (error) {
			if (loadAllDataRequestRef.current === requestId) {
				console.error("Failed to load data:", error);
				applyLoadError(error instanceof Error ? error : new Error("Failed to load data"));
			}
		} finally {
			if (loadAllDataRequestRef.current === requestId) {
				pendingDataRequestRef.current = null;
				setIsLoading(false);
				setLoadingMessage(null);
			}
		}
	}, [applyDuplicateRepairPlan, applyLoadError, applyMilestones, applySearchResults]);

	const refreshTasksData = useCallback(
		async (includeMilestones: boolean) => {
			if (!hasLoadedDataRef.current || loadErrorRef.current) return loadAllData();
			const supersededRank = pendingDataRequestRef.current === null ? -1 : pendingScopeRankRef.current;
			if (supersededRank >= 2) return loadAllData();
			const requestId = loadAllDataRequestRef.current + 1;
			loadAllDataRequestRef.current = requestId;
			protocolOnlyLoadingRef.current = false;
			pendingDataRequestRef.current = requestId;
			pendingScopeRankRef.current = includeMilestones || supersededRank >= 1 ? 1 : 0;
			try {
				await refreshAppData(includeMilestones, {
					hasLoadedData: hasLoadedDataRef.current,
					loadError: loadErrorRef.current,
					pendingScopeRank: supersededRank,
					getTasks: () => tasksRef.current,
					getMilestones: () => milestoneEntitiesRef.current,
					getArchivedMilestones: () => archivedMilestonesRef.current,
					setMilestones: (milestonesData, archivedMilestonesData) => {
						milestoneEntitiesRef.current = milestonesData;
						archivedMilestonesRef.current = archivedMilestonesData;
						setMilestoneEntities(milestonesData);
						setArchivedMilestones(archivedMilestonesData);
					},
					applySearchResults: (searchResults, milestonesData, archivedMilestonesData) => {
						const archivedKeys = new Set(collectArchivedMilestoneKeys(archivedMilestonesData, milestonesData));
						const milestoneAliases = buildMilestoneAliasMap(milestonesData, archivedMilestonesData);
						const { tasks: tasksList } = applySearchResults(searchResults, archivedKeys, milestoneAliases);
						applyMilestones(tasksList, milestonesData, archivedMilestonesData);
						return tasksList;
					},
					getDuplicateRepairPlan: () => duplicateRepairPlanRef.current,
					applyDuplicateRepairPlan,
					loadAllData,
					isRequestCurrent: () => loadAllDataRequestRef.current === requestId,
				});
			} catch {
				if (loadAllDataRequestRef.current === requestId) await loadAllData();
			} finally {
				if (loadAllDataRequestRef.current === requestId) pendingDataRequestRef.current = null;
			}
		},
		[applyDuplicateRepairPlan, applyMilestones, applySearchResults, loadAllData],
	);

	const refreshData = useCallback(async () => {
		await refreshTasksData(false);
		window.dispatchEvent(new Event("drafts-updated"));
	}, [refreshTasksData]);

	const refreshMilestoneData = useCallback(async () => {
		await refreshTasksData(true);
		window.dispatchEvent(new Event("drafts-updated"));
	}, [refreshTasksData]);

	const fullRefreshData = useCallback(async () => {
		await loadAllData();
		window.dispatchEvent(new Event("drafts-updated"));
	}, [loadAllData]);

	const applyReorderedTasks = useCallback((updatedTasks: Task[], requestTask: Task) => {
		const current = tasksRef.current;
		if (current.find((task) => task.id === requestTask.id) !== requestTask) return;
		const updatesById = new Map(updatedTasks.map((task) => [task.id, task]));
		const next = current.map((task) => updatesById.get(task.id) ?? task);
		tasksRef.current = next;
		setTasks(next);
	}, []);

	useAppDataWebSocketEvents({
		refreshData,
		refreshMilestoneData,
		fullRefreshData,
		loadAllData,
		applyLoadError,
		setIsLoading,
		setLoadingMessage,
		hasLoadedDataRef,
		pendingDataRequestRef,
		protocolOnlyLoadingRef,
	});

	return {
		dataVersion,
		statuses,
		availableLabels,
		projectName,
		config,
		milestones,
		milestoneEntities,
		archivedMilestones,
		tasks,
		docs,
		decisions,
		isLoading,
		loadingMessage,
		loadError,
		duplicateRepairPlan,
		loadAllData,
		refreshData,
		refreshMilestoneData,
		applyReorderedTasks,
	};
}
