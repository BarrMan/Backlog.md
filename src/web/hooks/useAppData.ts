import { useCallback, useEffect, useRef, useState } from "react";
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
	TaskSummary,
} from "../../types";
import { useHealthCheckContext } from "../contexts/HealthCheckContext";
import { apiClient } from "../lib/api";
import { buildMilestoneAliasMap, canonicalizeMilestone } from "../utils/milestone-aliases";
import { collectArchivedMilestoneKeys, collectMilestoneIds, milestoneKey } from "../utils/milestones";
import { reconcileById } from "../utils/reconcile";
import { refreshAppData } from "./app-data-refresh";
import { useAppDataWebSocketEvents } from "./use-app-data-websocket-events";

function createInitialDataController() {
	const taskSummaries = apiClient.fetchTasks();
	const searchResults = apiClient.search({ types: ["document", "decision"] });
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
		taskSummaries,
	};
}

export function useAppData() {
	const { reportConnection, setRetry } = useHealthCheckContext();
	const [dataVersion, setDataVersion] = useState(0);
	const [statuses, setStatuses] = useState<string[]>([]);
	const [availableLabels, setAvailableLabels] = useState<string[]>([]);
	const [projectName, setProjectName] = useState("");
	const [config, setConfig] = useState<BacklogConfig | null>(null);
	const [milestones, setMilestones] = useState<string[]>([]);
	const [milestoneEntities, setMilestoneEntities] = useState<Milestone[]>([]);
	const [archivedMilestones, setArchivedMilestones] = useState<Milestone[]>([]);
	const [tasks, setTasks] = useState<TaskSummary[]>([]);
	const [docs, setDocs] = useState<Document[]>([]);
	const [decisions, setDecisions] = useState<Decision[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<Error | null>(null);
	const [duplicateRepairPlan, setDuplicateRepairPlan] = useState<DuplicateRepairPlan | null>(null);
	const tasksRef = useRef<TaskSummary[]>([]);
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
	const scopeRef = useRef(0);
	const mountedRef = useRef(false);

	useEffect(() => {
		mountedRef.current = true;
		const scope = scopeRef.current;
		return () => {
			if (scopeRef.current !== scope) return;
			mountedRef.current = false;
			scopeRef.current += 1;
			loadAllDataRequestRef.current += 1;
			pendingDataRequestRef.current = null;
		};
	}, []);

	const applySearchResults = useCallback(
		(
			tasksData: TaskSummary[],
			results: SearchResult[],
			archivedMilestoneKeys?: Set<string>,
			milestoneAliases?: Map<string, string>,
		) => {
			const documentResults = results.filter((result): result is DocumentSearchResult => result.type === "document");
			const decisionResults = results.filter((result): result is DecisionSearchResult => result.type === "decision");
			const normalizedTasks = tasksData.map((task) => {
				const canonicalMilestone = canonicalizeMilestone(task.milestone, milestoneAliases);
				if (!canonicalMilestone || !archivedMilestoneKeys?.has(milestoneKey(canonicalMilestone))) {
					return task.milestone === canonicalMilestone ? task : { ...task, milestone: canonicalMilestone || undefined };
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
		(tasksList: TaskSummary[], milestonesData: Milestone[], archivedMilestonesData: Milestone[]) => {
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
		if (!mountedRef.current) return;
		apiClient.detailCache.invalidate();
		const scope = scopeRef.current;
		const requestId = loadAllDataRequestRef.current + 1;
		loadAllDataRequestRef.current = requestId;
		const isCurrent = () =>
			mountedRef.current && scopeRef.current === scope && loadAllDataRequestRef.current === requestId;
		protocolOnlyLoadingRef.current = false;
		pendingDataRequestRef.current = requestId;
		pendingScopeRankRef.current = 2;
		try {
			if (!hasLoadedDataRef.current) setIsLoading(true);
			applyLoadError(null);
			const initialData = createInitialDataController();
			const [statusesData, configData, milestonesData, archivedMilestonesData] = await initialData.shellData;
			if (!isCurrent()) return;
			setStatuses(statusesData);
			setProjectName(configData.projectName);
			setAvailableLabels(configData.labels || []);
			setConfig(configData);
			milestoneEntitiesRef.current = milestonesData;
			archivedMilestonesRef.current = archivedMilestonesData;
			setMilestoneEntities(milestonesData);
			setArchivedMilestones(archivedMilestonesData);
			const [taskSummaries, searchResults] = await Promise.all([initialData.taskSummaries, initialData.searchResults]);
			if (!isCurrent()) return;
			const archivedKeys = new Set(collectArchivedMilestoneKeys(archivedMilestonesData, milestonesData));
			const milestoneAliases = buildMilestoneAliasMap(milestonesData, archivedMilestonesData);
			const { tasks: tasksList } = applySearchResults(taskSummaries, searchResults, archivedKeys, milestoneAliases);
			hasLoadedDataRef.current = true;
			applyMilestones(tasksList, milestonesData, archivedMilestonesData);
			void apiClient
				.fetchDuplicateTaskRepairPlan()
				.then((plan) => {
					if (isCurrent()) applyDuplicateRepairPlan(plan);
				})
				.catch(() => {
					if (isCurrent()) applyDuplicateRepairPlan(null);
				});
		} catch (error) {
			if (isCurrent()) {
				console.error("Failed to load data:", error);
				applyLoadError(error instanceof Error ? error : new Error("Failed to load data"));
			}
		} finally {
			if (isCurrent()) {
				pendingDataRequestRef.current = null;
				setIsLoading(false);
				setLoadingMessage(null);
			}
		}
	}, [applyDuplicateRepairPlan, applyLoadError, applyMilestones, applySearchResults]);

	const refreshTasksData = useCallback(
		async (includeMilestones: boolean) => {
			if (!mountedRef.current) return;
			apiClient.detailCache.invalidate();
			if (!hasLoadedDataRef.current || loadErrorRef.current) return loadAllData();
			const supersededRank = pendingDataRequestRef.current === null ? -1 : pendingScopeRankRef.current;
			if (supersededRank >= 2) return loadAllData();
			const requestId = loadAllDataRequestRef.current + 1;
			loadAllDataRequestRef.current = requestId;
			const scope = scopeRef.current;
			const isCurrent = () =>
				mountedRef.current && scopeRef.current === scope && loadAllDataRequestRef.current === requestId;
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
					applySearchResults: (tasksData, searchResults, milestonesData, archivedMilestonesData) => {
						const archivedKeys = new Set(collectArchivedMilestoneKeys(archivedMilestonesData, milestonesData));
						const milestoneAliases = buildMilestoneAliasMap(milestonesData, archivedMilestonesData);
						const { tasks: tasksList } = applySearchResults(tasksData, searchResults, archivedKeys, milestoneAliases);
						applyMilestones(tasksList, milestonesData, archivedMilestonesData);
						return tasksList;
					},
					getDuplicateRepairPlan: () => duplicateRepairPlanRef.current,
					applyDuplicateRepairPlan,
					loadAllData,
					isRequestCurrent: isCurrent,
				});
			} catch {
				if (isCurrent()) await loadAllData();
			} finally {
				if (isCurrent()) pendingDataRequestRef.current = null;
			}
		},
		[applyDuplicateRepairPlan, applyMilestones, applySearchResults, loadAllData],
	);

	const refreshData = useCallback(async () => {
		await refreshTasksData(false);
		if (mountedRef.current) window.dispatchEvent(new window.Event("drafts-updated"));
	}, [refreshTasksData]);

	const refreshMilestoneData = useCallback(async () => {
		await refreshTasksData(true);
		if (mountedRef.current) window.dispatchEvent(new window.Event("drafts-updated"));
	}, [refreshTasksData]);

	const fullRefreshData = useCallback(async () => {
		await loadAllData();
		if (mountedRef.current) window.dispatchEvent(new window.Event("drafts-updated"));
	}, [loadAllData]);

	const applyReorderedTasks = useCallback((updatedTasks: Task[], requestTask: TaskSummary | Task) => {
		if (tasksRef.current.find((task) => task.id === requestTask.id) !== requestTask) return;
		const updates = new Map(updatedTasks.map((task) => [task.id, task]));
		const nextTasks = tasksRef.current.map((task) => {
			const update = updates.get(task.id);
			if (!update) return task;
			return {
				...task,
				title: update.title,
				status: update.status,
				assignee: update.assignee,
				reporter: update.reporter,
				createdDate: update.createdDate,
				updatedDate: update.updatedDate,
				dueDate: update.dueDate,
				labels: update.labels,
				milestone: update.milestone,
				dependencies: update.dependencies,
				references: update.references,
				documentation: update.documentation,
				modifiedFiles: update.modifiedFiles,
				parentTaskId: update.parentTaskId,
				parentTaskTitle: update.parentTaskTitle,
				subtasks: update.subtasks,
				subtaskSummaries: update.subtaskSummaries,
				priority: update.priority,
				type: update.type,
				project: update.project,
				branch: update.branch,
				ordinal: update.ordinal,
				source: update.source,
			};
		});
		tasksRef.current = nextTasks;
		setTasks(nextTasks);
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
		reportConnection,
		setRetry,
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
