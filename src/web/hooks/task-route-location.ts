import { useLocation, useMatch, useNavigate } from "react-router-dom";
import type { TaskRouteNavigationState } from "./useTaskRouteDetail";

export type TaskRouteBasePath = "/tasks" | "/board" | null;

export function useTaskRouteLocation() {
	const location = useLocation();
	const navigate = useNavigate();
	const tasksRouteWithTitle = useMatch("/tasks/:id/:title");
	const tasksRoute = useMatch("/tasks/:id");
	const boardRouteWithTitle = useMatch("/board/:id/:title");
	const boardRoute = useMatch("/board/:id");
	const taskMatch = tasksRouteWithTitle ?? tasksRoute;
	const boardMatch = boardRouteWithTitle ?? boardRoute;
	const route = taskMatch
		? { basePath: "/tasks" as const, taskId: taskMatch?.params.id }
		: { basePath: boardMatch ? ("/board" as const) : null, taskId: boardMatch?.params.id };
	const routeState =
		location.state && typeof location.state === "object" ? (location.state as TaskRouteNavigationState) : {};

	return { location, navigate, routeState, ...route };
}
