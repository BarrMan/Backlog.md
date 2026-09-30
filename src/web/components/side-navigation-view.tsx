import { NavLink } from "react-router-dom";

export function SideNavigationHeader({
	isCollapsed,
	onToggleCollapse,
	onExpandAndFocusSearch,
	searchInputRef,
	searchQuery,
	onSearchQueryChange,
	shortcut,
}: {
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	onExpandAndFocusSearch: () => void;
	searchInputRef: (element: HTMLInputElement | null) => void;
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
	shortcut: string;
}) {
	return (
		<div
			className={`${isCollapsed ? "px-2" : "px-4"} border-b border-gray-200 dark:border-gray-700 h-18 flex items-center relative`}
		>
			<button
				type="button"
				onClick={onToggleCollapse}
				className="absolute -right-3 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-circle shadow-sm hover:shadow-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-200"
				aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
			>
				{isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
			</button>
			{isCollapsed ? (
				<div className="flex items-center justify-center">
					<button
						type="button"
						onClick={onExpandAndFocusSearch}
						className="flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
						title={`Search (${shortcut})`}
					>
						<SearchIcon />
					</button>
				</div>
			) : (
				<div className="relative flex-1">
					<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
						<SearchIcon />
					</div>
					<input
						ref={searchInputRef}
						type="text"
						placeholder={`Search (${shortcut})...`}
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						className="w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
						>
							×
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export function SideNavigationFooter({ isCollapsed, version }: { isCollapsed: boolean; version: string }) {
	return (
		<div className={`border-t border-gray-200 dark:border-gray-700 ${isCollapsed ? "px-2 py-2" : "px-4 py-4"}`}>
			<NavLink
				to="/settings"
				{...(isCollapsed ? { "data-tooltip-id": "sidebar-tooltip", "data-tooltip-content": "Settings" } : {})}
				className={({ isActive }) =>
					isCollapsed
						? `flex items-center justify-center p-3 rounded-md transition-colors duration-200 ${isActive ? "bg-stone-50 dark:bg-stone-900/30 text-stone-700 dark:text-stone-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
						: `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
				}
			>
				<div className={isCollapsed ? "w-6 h-6 flex items-center justify-center" : undefined}>
					<SettingsIcon />
				</div>
				{!isCollapsed && (
					<>
						<span className="ml-3 text-sm font-medium">Settings</span>
						{version && (
							<span className="ml-auto text-xs text-gray-500 dark:text-gray-400">Backlog.md - v{version}</span>
						)}
					</>
				)}
			</NavLink>
		</div>
	);
}

const SearchIcon = () => (
	<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
		/>
	</svg>
);
const ChevronLeftIcon = () => (
	<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
	</svg>
);
const ChevronRightIcon = () => (
	<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	</svg>
);
const SettingsIcon = () => (
	<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31 2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
		/>
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
	</svg>
);
