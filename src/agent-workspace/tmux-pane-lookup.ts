export type PaneLookupRow = {
	paneId: string;
	dead: boolean;
	windowId?: string;
	taskId: string;
	role: string;
	rootPath: string;
	title: string;
};

type TmuxCommand = (command: string, args: readonly string[]) => Promise<readonly string[]>;

type FindPaneOptions = {
	cmd: TmuxCommand;
	rootPath: string;
	role: string;
	taskId?: string;
	includeDead?: boolean;
	includeWindow?: boolean;
};

const PANE_LOOKUP_FORMAT = [
	"#{pane_id}",
	"#{pane_dead}",
	"#{window_id}",
	"#{@backlog_root}",
	"#{@backlog_task}",
	"#{@backlog_role}",
	"#{pane_title}",
].join("\t");

export function paneTitle(taskId: string, role: string): string {
	return `${taskId} ${role}`;
}

export async function findTmuxPanesByTaskAndRole(options: FindPaneOptions): Promise<PaneLookupRow[]> {
	const listed = await options.cmd("list-panes", ["-a", "-f", paneFilter(options), "-F", PANE_LOOKUP_FORMAT]);
	return listed
		.flatMap((line) => line.split("\n"))
		.map(parsePaneLookupRow)
		.filter((pane): pane is PaneLookupRow => pane !== undefined)
		.filter(
			(pane) =>
				(options.includeDead || !pane.dead) &&
				pane.rootPath === options.rootPath &&
				pane.taskId &&
				pane.role === options.role &&
				(options.taskId === undefined ||
					(pane.taskId === options.taskId && pane.title === paneTitle(options.taskId, options.role))) &&
				(options.includeWindow || pane.windowId !== undefined),
		);
}

function parsePaneLookupRow(line: string): PaneLookupRow | undefined {
	const [paneId, dead, windowId, root, taskId, role, title] = line.split("\t");
	if (!paneId?.startsWith("%") || root === undefined || taskId === undefined || role === undefined) return undefined;
	return {
		paneId,
		dead: dead === "1",
		windowId: windowId || undefined,
		rootPath: root,
		taskId,
		role,
		title: title ?? "",
	};
}

function paneFilter(options: FindPaneOptions): string {
	const conditions = [
		equals("#{@backlog_root}", options.rootPath),
		equals("#{@backlog_role}", options.role),
		...(options.taskId
			? [equals("#{@backlog_task}", options.taskId), equals("#{pane_title}", paneTitle(options.taskId, options.role))]
			: []),
		...(options.includeDead ? [] : [equals("#{pane_dead}", "0")]),
	];
	return and(conditions);
}

function equals(left: string, right: string): string {
	return `#{==:${left},${formatLiteral(right)}}`;
}

function and(conditions: readonly string[]): string {
	return conditions.reduce((combined, condition) => (combined ? `#{&&:${combined},${condition}}` : condition), "");
}

function formatLiteral(value: string): string {
	return value.replaceAll("#", "##").replaceAll(",", "#,").replaceAll("}", "#}");
}
