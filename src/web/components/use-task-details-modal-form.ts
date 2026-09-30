import { useMemo } from "react";
import type { TaskDetail } from "../../core/task-detail";
import type { AcceptanceCriterion, Task, TaskComment } from "../../types";
import { useTaskDetailFormState } from "../hooks/use-task-detail-form-state";
import { useTaskMetadataOptions } from "../hooks/use-task-metadata-options";
import {
	createModeAssignee as createDefaultAssignee,
	defaultDefinitionOfDone as createDefaultDefinitionOfDone,
} from "./task-details-modal-policy";

export function useTaskDetailsModalForm({
	task,
	isCreateMode,
	isDraftMode,
	availableStatuses,
	definitionOfDoneDefaults,
	defaultAssignee,
	availablePriorities,
	availableTypes,
	availableProjects,
}: {
	task?: Task | TaskDetail;
	isCreateMode: boolean;
	isDraftMode?: boolean;
	availableStatuses: string[];
	definitionOfDoneDefaults?: string[];
	defaultAssignee?: string[];
	availablePriorities?: string[];
	availableTypes?: string[];
	availableProjects?: string[];
}) {
	const configuredDefinitionOfDone = useMemo(
		() => createDefaultDefinitionOfDone(definitionOfDoneDefaults),
		[definitionOfDoneDefaults],
	);
	const createModeAssignee = useMemo(
		() => createDefaultAssignee(isCreateMode, defaultAssignee),
		[isCreateMode, defaultAssignee],
	);
	const { priorityOptions, typeOptions, projectOptions } = useTaskMetadataOptions({
		availablePriorities,
		availableTypes,
		availableProjects,
	});
	const form = useTaskDetailFormState({
		task,
		isCreateMode,
		isDraftMode,
		availableStatuses,
		defaultDefinitionOfDone: configuredDefinitionOfDone,
		createModeAssignee,
	});
	return {
		form,
		createModeAssignee,
		priorityOptions,
		typeOptions,
		projectOptions,
		changes: {
			title: (value: string) => form.setField("title", value),
			description: (value: string) => form.setField("description", value),
			plan: (value: string) => form.setField("plan", value),
			notes: (value: string) => form.setField("notes", value),
			displayComments: (value: TaskComment[]) => form.setField("displayComments", value),
			commentBody: (value: string) => form.setField("commentBody", value),
			commentAuthor: (value: string) => form.setField("commentAuthor", value),
			finalSummary: (value: string) => form.setField("finalSummary", value),
			criteria: (value: AcceptanceCriterion[]) => form.setField("criteria", value),
			definitionOfDone: (value: AcceptanceCriterion[]) => form.setField("definitionOfDone", value),
			status: (value: string) => form.setField("status", value),
			assignee: (value: string[]) => form.setField("assignee", value),
			labels: (value: string[]) => form.setField("labels", value),
			priority: (value: string) => form.setField("priority", value),
			taskType: (value: string) => form.setField("taskType", value),
			project: (value: string) => form.setField("project", value),
			dependencies: (value: string[]) => form.setField("dependencies", value),
			references: (value: string[]) => form.setField("references", value),
			modifiedFiles: (value: string[]) => form.setField("modifiedFiles", value),
			milestone: (value: string) => form.setField("milestone", value),
			dueDate: (value: string) => form.setField("dueDate", value),
		},
	};
}
