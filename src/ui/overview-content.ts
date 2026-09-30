import type { TaskStatistics } from "../core/statistics.ts";
import { formatPriorityLabel } from "../utils/priority-config.ts";
import { getStatusIcon } from "./status-icon.ts";

type OverviewPriorityRow = { label: string; count: number; color: string };

const priorityColors: Record<string, string> = { high: "red", medium: "yellow", low: "green", none: "gray" };
const percentage = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
const taskLine = (task: { id: string; title: string }, limit?: number) =>
	`${task.id} - ${limit && task.title.length > limit ? `${task.title.substring(0, limit)}...` : task.title}`;

function getPriorityBreakdownRows(statistics: TaskStatistics): OverviewPriorityRow[] {
	const rows = Array.from(statistics.priorityCounts)
		.filter(([, count]) => count > 0)
		.map(([priority, count]) => ({
			label: formatPriorityLabel(priority),
			count,
			color: priorityColors[priority] ?? "white",
		}));
	if (statistics.noPriorityCount > 0)
		rows.push({ label: "No Priority", count: statistics.noPriorityCount, color: "gray" });
	return rows;
}

export function overviewStatusContent(statistics: TaskStatistics, tagged: boolean): string {
	const rows = Array.from(
		statistics.statusCounts,
		([status, count]) =>
			`  ${tagged ? `${getStatusIcon(status)} {bold}${status}:{/bold}` : `${status}:`} ${count} tasks (${percentage(count, statistics.totalTasks)}%)`,
	);
	rows.push(`\n  ${tagged ? "{cyan-fg}Total Tasks:{/cyan-fg}" : "Total Tasks:"} ${statistics.totalTasks}`);
	rows.push(`  ${tagged ? "{green-fg}Completion:{/green-fg}" : "Completion:"} ${statistics.completionPercentage}%`);
	if (statistics.draftCount > 0)
		rows.push(`  ${tagged ? "{yellow-fg}Drafts:{/yellow-fg}" : "Drafts:"} ${statistics.draftCount}`);
	return rows.join("\n");
}

export function overviewPriorityContent(statistics: TaskStatistics, tagged: boolean): string {
	return getPriorityBreakdownRows(statistics)
		.map(
			({ label, count, color }) =>
				`  ${tagged ? `{${color}-fg}${label}:{/${color}-fg}` : `${label}:`} ${count} tasks (${percentage(count, statistics.totalTasks)}%)`,
		)
		.join("\n");
}

export function overviewActivityContent(statistics: TaskStatistics, tagged: boolean): string {
	const section = (name: string, tasks: { id: string; title: string }[], empty: string) => [
		`${tagged ? "{bold}" : ""}${name}:${tagged ? "{/bold}" : ""}`,
		...(tasks.length
			? tasks.map((task) => `  ${taskLine(task, tagged ? 40 : undefined)}`)
			: [`  ${tagged ? "{gray-fg}" : ""}${empty}${tagged ? "{/gray-fg}" : ""}`]),
	];
	return [
		...section("Recently Created", statistics.recentActivity.created, "No tasks created in the last 7 days"),
		"",
		...section("Recently Updated", statistics.recentActivity.updated, "No tasks updated in the last 7 days"),
	].join("\n");
}

export function overviewHealthContent(statistics: TaskStatistics, tagged: boolean): string {
	const section = (
		name: string,
		tasks: { id: string; title: string }[],
		color: string,
		empty: string,
		detail: string,
	) => [
		`${tagged ? "{bold}" : ""}${name}:${tagged ? "{/bold}" : ""}${tagged ? ` {gray-fg}(${detail}){/gray-fg}` : ` (${detail})`}`,
		...(tasks.length
			? tasks.map(
					(task) =>
						`  ${tagged ? `{${color}-fg}` : ""}${taskLine(task, tagged ? 35 : undefined)}${tagged ? `{/${color}-fg}` : ""}`,
				)
			: [`  ${tagged ? "{green-fg}" : ""}${empty}${tagged ? "{/green-fg}" : ""}`]),
	];
	return [
		`${tagged ? "{bold}" : ""}Average Task Age:${tagged ? "{/bold}" : ""} ${statistics.projectHealth.averageTaskAge} days`,
		"",
		...section(
			"Stale Tasks",
			statistics.projectHealth.staleTasks,
			"yellow",
			"No stale tasks",
			">30 days without updates",
		),
		"",
		...section(
			"Blocked Tasks",
			statistics.projectHealth.blockedTasks,
			"red",
			"No blocked tasks",
			"waiting on dependencies",
		),
	].join("\n");
}
