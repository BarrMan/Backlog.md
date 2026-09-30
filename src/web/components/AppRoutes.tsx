import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
	AppLayoutRoute,
	BoardRoutePage,
	DecisionsRoutePage,
	DocumentationRoutePage,
	DraftsRoutePage,
	MilestonesRoutePage,
	StatisticsRoutePage,
	TaskListRoutePage,
} from "../features/app/AppRoutePages";
import type { TaskRouteNavigationState } from "../hooks/useTaskRouteDetail";
import Settings from "./Settings";

export function AppRoutes() {
	const location = useLocation();
	return (
		<Routes>
			<Route element={<AppLayoutRoute />}>
				<Route
					index
					element={<Navigate to={{ pathname: "/board", search: location.search }} replace state={location.state} />}
				/>
				<Route path="board" element={<BoardRoutePage />} />
				<Route path="board/:id" element={<BoardRoutePage />} />
				<Route path="board/:id/:title" element={<BoardRoutePage />} />
				<Route path="board/*" element={createInvalidTaskRoute("/board", location.search)} />
				<Route path="tasks" element={<TaskListRoutePage />} />
				<Route path="tasks/:id" element={<TaskListRoutePage />} />
				<Route path="tasks/:id/:title" element={<TaskListRoutePage />} />
				<Route path="tasks/*" element={createInvalidTaskRoute("/tasks", location.search)} />
				<Route path="milestones" element={<MilestonesRoutePage />} />
				<Route path="drafts" element={<DraftsRoutePage />} />
				<Route path="documentation" element={<DocumentationRoutePage />} />
				<Route path="documentation/:id" element={<DocumentationRoutePage />} />
				<Route path="documentation/:id/:title" element={<DocumentationRoutePage />} />
				<Route path="decisions" element={<DecisionsRoutePage />} />
				<Route path="decisions/:id" element={<DecisionsRoutePage />} />
				<Route path="decisions/:id/:title" element={<DecisionsRoutePage />} />
				<Route path="statistics" element={<StatisticsRoutePage />} />
				<Route path="settings" element={<Settings />} />
			</Route>
		</Routes>
	);
}

function createInvalidTaskRoute(pathname: "/board" | "/tasks", search: string) {
	return (
		<Navigate
			to={{ pathname, search }}
			replace
			state={{ taskRouteError: "That task link is not valid." } satisfies TaskRouteNavigationState}
		/>
	);
}
