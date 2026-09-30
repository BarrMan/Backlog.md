import type { Milestone, TaskSummary } from "../../types";
import {
	useBoardFilters,
	useBoardHighlight,
	useBoardPageProps,
	useBoardRouteState,
} from "../hooks/use-board-page-state";
import Board from "./Board";

export interface BoardPageProps {
	onEditTask: (task: TaskSummary | import("../../types").Task) => void;
	onNewTask: () => void;
	tasks: TaskSummary[] | import("../../types").Task[];
	onRefreshData?: () => Promise<void>;
	onTasksUpdated?: (tasks: import("../../types").Task[], requestTask: import("../../types").Task) => void;
	statuses: string[];
	milestones: string[];
	availableLabels: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	isLoading: boolean;
	loadingMessage?: string | null;
	loadError?: Error | null;
	hideEmptyColumns?: boolean;
	dateFormat?: string;
	availablePriorities?: string[];
	availableTypes?: string[];
	availableProjects?: string[];
}

export default function BoardPage(props: BoardPageProps) {
	const route = useBoardRouteState();
	const highlight = useBoardHighlight(route.searchParams, route.setSearchParams, props.onEditTask);
	const filters = useBoardFilters(
		route.searchParams,
		route.setSearchParams,
		props.isLoading,
		props.availablePriorities,
		props.availableTypes,
		props.availableProjects,
	);
	const boardProps = useBoardPageProps(props, route, highlight, filters);

	return (
		<div className="page-shell transition-colors duration-200">
			<Board {...boardProps} />
		</div>
	);
}
