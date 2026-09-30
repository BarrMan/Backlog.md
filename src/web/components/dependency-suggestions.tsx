import type { Task } from "../../types";

interface DependencySuggestionsProps {
	suggestions: Task[];
	selectedIndex: number;
	onSelect: (taskId: string) => void;
}

export function DependencySuggestions({ suggestions, selectedIndex, onSelect }: DependencySuggestionsProps) {
	if (suggestions.length === 0) return null;

	return (
		<div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-auto overscroll-contain transition-colors duration-200">
			{suggestions.map((task, index) => (
				<button
					key={task.id}
					type="button"
					onClick={() => onSelect(task.id)}
					className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 ${
						index === selectedIndex ? "bg-gray-100 dark:bg-gray-700" : ""
					}`}
				>
					<div className="font-medium text-gray-900 dark:text-white">{task.id}</div>
					<div className="text-gray-600 dark:text-gray-300 break-words whitespace-normal">{task.title}</div>
				</button>
			))}
		</div>
	);
}
