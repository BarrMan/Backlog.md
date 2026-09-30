/** The shared browser corpus omits archived identities; completed identities remain detail-addressable only. */
export function filterKanbanTasks<T extends { source?: string }>(tasks: T[]): T[] {
	return tasks.filter((task) => task.source !== "completed");
}
