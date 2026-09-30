import React, { useCallback, useEffect, useRef } from "react";
import type { Task } from "../../../types";
import { getProjectValues } from "../../../utils/project-config";
import { getTaskTypeValues } from "../../../utils/task-type-config";
import { AppRoutes } from "../../components/AppRoutes";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useHealthCheckContext } from "../../contexts/HealthCheckContext";
import { TaskIdIndexProvider } from "../../contexts/TaskIdIndexContext";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { useAppLifecycle } from "../../hooks/use-app-lifecycle";
import { type TaskRouteNavigationState, useTaskRouteDetail } from "../../hooks/useTaskRouteDetail";
import { createUrlPath } from "../../utils/urlHelpers";
import { InitializationWizard } from "../initialization/InitializationWizard";
import { AppDataProvider, useAppDataContext } from "./AppDataContext";
import { AppRouteViewProvider } from "./AppRouteViewContext";
import { TaskModalLifecycle } from "./TaskModalLifecycle";

function useAppViewActions(routeDetail: ReturnType<typeof useTaskRouteDetail>) {
	const { location, navigate, openDetailModal, openCreateModal, routeBasePath, routeState, routeTaskId } = routeDetail;

	const handleNewTask = useCallback(() => {
		openCreateModal(false);
	}, [openCreateModal]);

	const handleNewDraft = useCallback(() => {
		openCreateModal(true);
	}, [openCreateModal]);

	const openTaskModal = useCallback(
		(task: Task) => {
			openDetailModal(task.id, { record: task });
		},
		[openDetailModal],
	);

	const openDraftModal = useCallback(
		(draft: Task) => {
			openDetailModal(draft.id, { record: draft, isDraft: true });
		},
		[openDetailModal],
	);

	const handleEditTask = useCallback(
		(task: Task) => {
			const basePath = location.pathname.startsWith("/board")
				? "/board"
				: location.pathname.startsWith("/tasks")
					? "/tasks"
					: null;

			if (!basePath) {
				openTaskModal(task);
				return;
			}

			const returnPath = `${basePath}${location.search}`;
			const isReplacingTaskRoute = routeBasePath === basePath && Boolean(routeTaskId);
			const taskModalFrom = isReplacingTaskRoute ? routeState.taskModalFrom : returnPath;
			navigate(`${createUrlPath(basePath, task.id, task.title)}${location.search}`, {
				replace: isReplacingTaskRoute,
				state: taskModalFrom ? ({ taskModalFrom } satisfies TaskRouteNavigationState) : undefined,
			});
		},
		[location.pathname, location.search, navigate, openTaskModal, routeBasePath, routeState.taskModalFrom, routeTaskId],
	);

	return { handleEditTask, handleNewDraft, handleNewTask, openDraftModal };
}

export default function AppShell() {
	return (
		<ThemeProvider>
			<AppDataProvider>
				<AppShellContent />
			</AppDataProvider>
		</ThemeProvider>
	);
}

function AppShellContent() {
	const {
		dataVersion,
		statuses,
		projectName,
		config,
		milestones,
		milestoneEntities,
		archivedMilestones,
		tasks,
		loadAllData,
		refreshData,
	} = useAppDataContext();
	const availableTypes = React.useMemo(() => getTaskTypeValues(config), [config]);
	const availableProjects = React.useMemo(() => getProjectValues(config), [config]);

	const { isOnline } = useHealthCheckContext();
	const { isInitialized, setIsInitialized, showSuccessToast, setShowSuccessToast } = useAppLifecycle({
		isOnline,
		projectName,
		loadAllData,
	});
	const routeDetail = useTaskRouteDetail(isInitialized, dataVersion);
	const { modal, closeModal: handleCloseModal, location, navigate, routeState: routeNavigationState } = routeDetail;
	const taskRouteAlertRef = useRef<HTMLDivElement | null>(null);
	const taskRouteError = routeNavigationState.taskRouteError;
	const { handleEditTask, handleNewDraft, handleNewTask, openDraftModal } = useAppViewActions(routeDetail);

	useEffect(() => {
		if (taskRouteError) {
			taskRouteAlertRef.current?.focus();
		}
	}, [taskRouteError]);

	// Show loading state while checking initialization
	if (isInitialized === null) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900" role="status">
				<LoadingSpinner size="md" text="" />
				<span className="sr-only">Loading</span>
			</div>
		);
	}

	// Show initialization screen if not initialized
	if (isInitialized === false) {
		return <InitializationWizard onInitialized={() => setIsInitialized(true)} />;
	}

	return (
		<TaskIdIndexProvider tasks={tasks}>
			<AppRouteViewProvider
				value={{
					showSuccessToast,
					onDismissSuccessToast: () => setShowSuccessToast(false),
					onEditTask: handleEditTask,
					onNewTask: handleNewTask,
					onEditDraft: openDraftModal,
					onNewDraft: handleNewDraft,
				}}
			>
				<AppRoutes />

				{taskRouteError && (
					<div
						ref={taskRouteAlertRef}
						role="alert"
						tabIndex={-1}
						className="fixed left-1/2 top-4 z-[70] flex w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
					>
						<span>{taskRouteError}</span>
						<button
							type="button"
							className="shrink-0 font-medium underline decoration-red-300 underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-red-500"
							onClick={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })}
						>
							Dismiss
						</button>
					</div>
				)}

				<TaskModalLifecycle
					modal={modal}
					closeModal={handleCloseModal}
					tasks={tasks}
					statuses={statuses}
					milestones={milestones}
					milestoneEntities={milestoneEntities}
					archivedMilestones={archivedMilestones}
					config={config}
					availableTypes={availableTypes}
					availableProjects={availableProjects}
					onNavigateToTask={handleEditTask}
					refreshData={refreshData}
				/>
			</AppRouteViewProvider>
		</TaskIdIndexProvider>
	);
}
