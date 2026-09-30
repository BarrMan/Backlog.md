import type { ChangeEvent } from "react";
import type { Task } from "../../types";

interface DependencySuggestionsInput {
	inputValue: string;
	value: string[];
	suggestableTasks: Task[];
	currentTaskId?: string;
}

export function getDependencySuggestions({
	inputValue,
	value,
	suggestableTasks,
	currentTaskId,
}: DependencySuggestionsInput): Task[] {
	const query = inputValue.trim().toLowerCase();
	if (!query) return [];

	return suggestableTasks.filter(
		(task) =>
			task.id !== currentTaskId &&
			!value.includes(task.id) &&
			(task.id.toLowerCase().includes(query) || task.title.toLowerCase().includes(query)),
	);
}

interface DependencyInputChangeOptions {
	disabled?: boolean;
	suggestions: Task[];
	selectedIndex: number;
	addDependency: (taskId: string) => void;
	setInputValue: (value: string) => void;
}

export function handleDependencyInputChange(
	event: ChangeEvent<HTMLTextAreaElement>,
	{ disabled, suggestions, selectedIndex, addDependency, setInputValue }: DependencyInputChangeOptions,
): void {
	if (disabled) return;

	const value = event.target.value;
	const selectedSuggestion = suggestions[selectedIndex];
	if (value.endsWith(",") && value.slice(0, -1).trim() && selectedSuggestion) {
		addDependency(selectedSuggestion.id);
		return;
	}
	setInputValue(value);
}
