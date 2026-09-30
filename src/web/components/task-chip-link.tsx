import { Link, useLocation } from "react-router-dom";

const CHIP_LABEL_CLASS = "truncate max-w-[16rem] sm:max-w-[20rem] md:max-w-[24rem]";

function taskChipDestination(pathname: string, search: string, state: unknown, taskId: string) {
	const basePath = pathname.startsWith("/board") ? "/board" : pathname.startsWith("/tasks") ? "/tasks" : null;
	const targetPath = basePath ?? "/tasks";
	const isReplacingTaskRoute = basePath !== null && pathname.startsWith(`${basePath}/`);
	const taskModalFrom =
		state && typeof state === "object" ? (state as { taskModalFrom?: string }).taskModalFrom : undefined;
	return {
		to: `${targetPath}/${taskId}${basePath ? search : ""}`,
		replace: isReplacingTaskRoute,
		state: taskModalFrom ? { taskModalFrom } : basePath ? { taskModalFrom: `${basePath}${search}` } : undefined,
	};
}

export function TaskChipLink({ taskId, display }: { taskId: string; display: string }) {
	const location = useLocation();
	const destination = taskChipDestination(location.pathname, location.search, location.state, taskId);
	return (
		<Link {...destination} className={`${CHIP_LABEL_CLASS} hover:underline`} title={display}>
			{display}
		</Link>
	);
}
