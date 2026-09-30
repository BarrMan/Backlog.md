import type { SortDirection, TaskSortColumn } from "./task-list-sorting";

interface TaskListTableHeaderProps {
	sortColumn: TaskSortColumn;
	sortDirection: SortDirection;
	onSortChange: (column: TaskSortColumn) => void;
}

const SORTABLE_COLUMNS: readonly [string, TaskSortColumn][] = [
	["ID", "id"],
	["Title", "title"],
	["Status", "status"],
	["Priority", "priority"],
	["Ordinal", "ordinal"],
];

function SortableHeader({
	label,
	column,
	sortColumn,
	sortDirection,
	onSortChange,
}: TaskListTableHeaderProps & { label: string; column: TaskSortColumn }) {
	const isActive = sortColumn === column;
	const ariaSort = !isActive ? "none" : sortDirection === "asc" ? "ascending" : "descending";
	const icon = !isActive ? "↕" : sortDirection === "asc" ? "▲" : "▼";
	const iconClassName = isActive
		? "text-[10px] text-gray-600 dark:text-gray-300 select-none"
		: "text-[10px] text-gray-300 dark:text-gray-600 select-none";
	return (
		<th className="px-3 py-2" aria-sort={ariaSort}>
			<button
				type="button"
				onClick={() => onSortChange(column)}
				className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100"
			>
				{label}
				<span className={iconClassName} aria-hidden="true">
					{icon}
				</span>
			</button>
		</th>
	);
}

export function TaskListTableHeader(props: TaskListTableHeaderProps) {
	return (
		<thead>
			<tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
				{SORTABLE_COLUMNS.map(([label, column]) => (
					<SortableHeader key={column} label={label} column={column} {...props} />
				))}
				<th className="px-3 py-2">Labels</th>
				<th className="px-3 py-2">Assignee</th>
				<SortableHeader label="Milestone" column="milestone" {...props} />
				<SortableHeader label="Created" column="created" {...props} />
			</tr>
		</thead>
	);
}
