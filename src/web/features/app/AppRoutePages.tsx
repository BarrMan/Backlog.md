import { getProjectValues } from "../../../utils/project-config";
import { getTaskTypeValues } from "../../../utils/task-type-config";
import BoardPage from "../../components/BoardPage";
import DecisionDetail from "../../components/DecisionDetail";
import DocumentationDetail from "../../components/DocumentationDetail";
import DraftsList from "../../components/DraftsList";
import Layout from "../../components/Layout";
import MilestonesPage from "../../components/MilestonesPage";
import Statistics from "../../components/Statistics";
import TaskList from "../../components/TaskList";
import { filterKanbanTasks } from "../../utils/kanban-tasks";
import { useAppDataContext } from "./AppDataContext";
import { useAppRouteView } from "./AppRouteViewContext";

export function AppLayoutRoute() {
	const {
		projectName,
		tasks,
		docs,
		decisions,
		isLoading,
		loadingMessage,
		loadError,
		refreshData,
		duplicateRepairPlan,
	} = useAppDataContext();
	const { showSuccessToast, onDismissSuccessToast } = useAppRouteView();

	return (
		<Layout
			projectName={projectName}
			showSuccessToast={showSuccessToast}
			onDismissToast={onDismissSuccessToast}
			tasks={tasks}
			docs={docs}
			decisions={decisions}
			isLoading={isLoading}
			loadingMessage={loadingMessage}
			error={loadError}
			onRefreshData={refreshData}
			duplicateRepairPlan={duplicateRepairPlan}
		/>
	);
}

export function BoardRoutePage() {
	const {
		tasks,
		statuses,
		milestones,
		availableLabels,
		milestoneEntities,
		archivedMilestones,
		isLoading,
		loadError,
		refreshData,
		applyReorderedTasks,
		config,
	} = useAppDataContext();
	const { onEditTask, onNewTask } = useAppRouteView();

	return (
		<BoardPage
			tasks={filterKanbanTasks(tasks)}
			statuses={statuses}
			milestones={milestones}
			availableLabels={availableLabels}
			milestoneEntities={milestoneEntities}
			archivedMilestones={archivedMilestones}
			isLoading={isLoading}
			loadError={loadError}
			hideEmptyColumns={config?.hideEmptyColumns ?? false}
			dateFormat={config?.dateFormat}
			availablePriorities={config?.priorities}
			availableTypes={getTaskTypeValues(config)}
			availableProjects={getProjectValues(config)}
			onEditTask={onEditTask}
			onNewTask={onNewTask}
			onRefreshData={refreshData}
			onTasksUpdated={applyReorderedTasks}
		/>
	);
}

export function TaskListRoutePage() {
	const {
		tasks,
		statuses,
		availableLabels,
		milestones,
		milestoneEntities,
		archivedMilestones,
		isLoading,
		refreshData,
		config,
	} = useAppDataContext();
	const { onEditTask, onNewTask } = useAppRouteView();

	return (
		<TaskList
			tasks={tasks}
			availableStatuses={statuses}
			availableLabels={availableLabels}
			availablePriorities={config?.priorities}
			milestoneEntities={milestoneEntities}
			archivedMilestones={archivedMilestones}
			availableMilestones={milestones}
			dateFormat={config?.dateFormat}
			isLoading={isLoading}
			onEditTask={onEditTask}
			onNewTask={onNewTask}
			onRefreshData={refreshData}
		/>
	);
}

export function MilestonesRoutePage() {
	const { tasks, statuses, milestoneEntities, archivedMilestones, refreshMilestoneData, config } = useAppDataContext();
	const { onEditTask } = useAppRouteView();
	return (
		<MilestonesPage
			tasks={tasks}
			statuses={statuses}
			milestoneEntities={milestoneEntities}
			archivedMilestones={archivedMilestones}
			onEditTask={onEditTask}
			onRefreshData={refreshMilestoneData}
			dateFormat={config?.dateFormat}
		/>
	);
}

export function DraftsRoutePage() {
	const { config } = useAppDataContext();
	const { onEditDraft, onNewDraft } = useAppRouteView();
	return <DraftsList onEditTask={onEditDraft} onNewDraft={onNewDraft} dateFormat={config?.dateFormat} />;
}

export function DocumentationRoutePage() {
	const { docs, refreshData, config } = useAppDataContext();
	return <DocumentationDetail docs={docs} onRefreshData={refreshData} dateFormat={config?.dateFormat} />;
}

export function DecisionsRoutePage() {
	const { decisions, refreshData, config } = useAppDataContext();
	return <DecisionDetail decisions={decisions} onRefreshData={refreshData} dateFormat={config?.dateFormat} />;
}

export function StatisticsRoutePage() {
	const { isLoading, projectName, config } = useAppDataContext();
	const { onEditTask } = useAppRouteView();
	return (
		<Statistics
			isLoading={isLoading}
			onEditTask={onEditTask}
			projectName={projectName}
			dateFormat={config?.dateFormat}
		/>
	);
}
