import type { RefObject } from "react";

export function TaskColumnHeader({
	title,
	taskCount,
	canReorder,
	showMenu,
	menuRef,
	actionsId,
	onToggleMenu,
	onSort,
}: {
	title: string;
	taskCount: number;
	canReorder: boolean;
	showMenu: boolean;
	menuRef: RefObject<HTMLDivElement | null>;
	actionsId: string;
	onToggleMenu: () => void;
	onSort: (direction: "priority" | "asc" | "desc") => void;
}) {
	const status = title.toLowerCase();
	const badge =
		status.includes("done") || status.includes("complete")
			? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 transition-colors duration-200"
			: status.includes("progress") || status.includes("doing")
				? "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 transition-colors duration-200"
				: status.includes("blocked") || status.includes("stuck")
					? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 transition-colors duration-200"
					: "bg-stone-100 dark:bg-stone-900 text-stone-800 dark:text-stone-200 transition-colors duration-200";
	return (
		<div className="flex items-center justify-between mb-4">
			<div className="flex items-center gap-2">
				<h3 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200">{title}</h3>
				<span className={`px-2 py-1 text-xs font-medium rounded-circle ${badge}`}>{taskCount}</span>
			</div>
			{canReorder && (
				<div className="relative" ref={menuRef}>
					<button
						type="button"
						onClick={onToggleMenu}
						className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 focus:outline-none"
						title="Column actions"
						aria-label="Column actions"
						aria-haspopup="menu"
						aria-expanded={showMenu}
						aria-controls={actionsId}
					>
						<svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
							<path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
						</svg>
					</button>
					{showMenu && (
						<div
							id={actionsId}
							role="menu"
							className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 py-1 ring-1 ring-black ring-opacity-5"
						>
							<button
								type="button"
								role="menuitem"
								onClick={() => onSort("priority")}
								className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors duration-150"
							>
								Sort by Priority
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={() => onSort("asc")}
								className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors duration-150"
							>
								Sort by Creation Date (oldest first)
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={() => onSort("desc")}
								className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors duration-150"
							>
								Sort by Creation Date (newest first)
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
