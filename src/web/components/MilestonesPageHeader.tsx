import type React from "react";

interface MilestonesPageHeaderProps {
	searchQuery: string;
	error: string | null;
	success: string | null;
	onSearchQueryChange: (value: string) => void;
	action: React.ReactNode;
}

const MilestonesPageHeader: React.FC<MilestonesPageHeaderProps> = ({
	searchQuery,
	error,
	success,
	onSearchQueryChange,
	action,
}) => (
	<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
		<div className="flex flex-wrap items-center gap-4">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">Milestones</h1>
			<div className="relative w-full min-w-[240px] max-w-[420px]">
				<label htmlFor="milestones-search" className="sr-only">
					Search milestones
				</label>
				<input
					id="milestones-search"
					type="text"
					value={searchQuery}
					onInput={(event) => onSearchQueryChange((event.target as HTMLInputElement).value)}
					placeholder="Search tasks"
					aria-label="Search milestones"
					className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-10 pl-10 text-sm text-gray-900 placeholder-gray-500 transition-colors duration-200 focus:border-transparent focus:ring-2 focus:ring-stone-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-stone-400"
				/>
				{searchQuery && (
					<button
						type="button"
						onClick={() => onSearchQueryChange("")}
						aria-label="Clear milestone search"
						className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
					>
						Clear
					</button>
				)}
			</div>
		</div>
		<div className="flex items-center gap-3">
			{success && <span className="text-sm text-green-600 dark:text-green-400">{success}</span>}
			{error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
			{action}
		</div>
	</div>
);

export default MilestonesPageHeader;
