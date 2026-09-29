import { useMemo } from "react";
import { getPriorityOptions } from "../../utils/priority-config";
import { getProjectValues } from "../../utils/project-config";
import { getTaskTypeValues } from "../../utils/task-type-config";

export function useTaskMetadataOptions({
	availablePriorities,
	availableTypes,
	availableProjects,
}: {
	availablePriorities?: string[];
	availableTypes?: string[];
	availableProjects?: string[];
}) {
	const priorityOptions = useMemo(() => getPriorityOptions(availablePriorities), [availablePriorities]);
	const typeOptions = useMemo(() => getTaskTypeValues(availableTypes), [availableTypes]);
	const projectOptions = useMemo(() => getProjectValues(availableProjects), [availableProjects]);
	return { priorityOptions, typeOptions, projectOptions };
}
