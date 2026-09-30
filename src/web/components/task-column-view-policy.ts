export function getTaskColumnClassName(
	isEmpty: boolean,
	isDragOver: boolean,
	sourceStatus: string | null | undefined,
	title: string,
	sourceLane: string | null | undefined,
	laneId: string | undefined,
): string {
	const base = "rounded-lg p-4 transition-colors duration-200 h-full";
	if (isDragOver && (sourceStatus !== title || (sourceLane ?? null) !== (laneId ?? null)))
		return `${base} ${isEmpty ? "min-h-24" : "min-h-96"} bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-600 border-dashed`;
	if (isEmpty)
		return `${base} min-h-24 bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50`;
	return `${base} min-h-96 bg-white border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700`;
}

export function getEmptyColumnMessage(sourceStatus: string | null | undefined, title: string): string {
	return sourceStatus && sourceStatus !== title ? "Drop to move" : "Empty";
}
