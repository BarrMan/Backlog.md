import { useCallback, useEffect, useRef, useState } from "react";
import type { AcceptanceCriterion, Task } from "../../types";
import type { TaskUpdatePayload } from "../components/task-details-form";
import { apiClient } from "../lib/api";

type InlineMetaUpdatePayload = Omit<Partial<Task>, "milestone"> & { milestone?: string | null };

type Fields = {
	criteria: AcceptanceCriterion[];
	definitionOfDone: AcceptanceCriterion[];
	status: string;
	assignee: string[];
	labels: string[];
	priority: string;
	taskType: string;
	project: string;
	dependencies: string[];
	references: string[];
	modifiedFiles: string[];
	milestone: string;
	title: string;
};

type Setters = { [K in keyof Fields]: (value: Fields[K]) => void };

const fieldForUpdate = (key: keyof InlineMetaUpdatePayload): keyof Fields => {
	if (key === "type") return "taskType";
	return key as keyof Fields;
};

export function useOptimisticTaskUpdates({
	task,
	disabled,
	fields,
	setters,
	onSaved,
	setError,
}: {
	task?: Task;
	disabled: boolean;
	fields: Fields;
	setters: Setters;
	onSaved?: () => Promise<void> | void;
	setError: (value: string | null) => void;
}) {
	const identity = `${task?.id ?? ""}\0${task?.source ?? ""}\0${task?.branch ?? ""}`;
	const identityRef = useRef(identity);
	const requestRef = useRef(new Map<keyof Fields, number>());
	const [typeUpdating, setTypeUpdating] = useState(false);
	const [typeError, setTypeError] = useState<string | null>(null);

	useEffect(() => {
		identityRef.current = identity;
		requestRef.current.clear();
		setTypeUpdating(false);
		setTypeError(null);
	}, [identity]);

	const isCurrent = useCallback(
		(field: keyof Fields, request: number, requestIdentity: string) =>
			identityRef.current === requestIdentity && requestRef.current.get(field) === request,
		[],
	);

	const update = useCallback(
		async (updates: InlineMetaUpdatePayload) => {
			if (disabled) return;
			setError(null);
			const requestIdentity = identityRef.current;
			const snapshots = Object.entries(updates).map(([key, value]) => {
				const field = fieldForUpdate(key as keyof InlineMetaUpdatePayload);
				const request = (requestRef.current.get(field) ?? 0) + 1;
				requestRef.current.set(field, request);
				const previous = fields[field];
				(setters[field] as (next: unknown) => void)(field === "milestone" ? (value ?? "") : value);
				return { field, previous, request };
			});
			if (!task) return;
			try {
				await apiClient.updateTask(task.id, updates);
				if (identityRef.current === requestIdentity) await onSaved?.();
			} catch (error) {
				for (const { field, previous, request } of snapshots) {
					if (isCurrent(field, request, requestIdentity)) (setters[field] as (next: unknown) => void)(previous);
				}
				if (identityRef.current === requestIdentity) setError(error instanceof Error ? error.message : String(error));
			}
		},
		[disabled, fields, isCurrent, onSaved, setError, setters, task],
	);

	const toggleCriterion = useCallback(
		async (index: number, checked: boolean) => {
			if (disabled || !task) return;
			const previous = fields.criteria ?? [];
			const next = previous.map((item) => (item.index === index ? { ...item, checked } : item));
			const requestIdentity = identityRef.current;
			const request = (requestRef.current.get("criteria") ?? 0) + 1;
			requestRef.current.set("criteria", request);
			setters.criteria(next);
			try {
				await apiClient.updateTask(task.id, { acceptanceCriteriaItems: next });
				if (identityRef.current === requestIdentity) await onSaved?.();
			} catch (error) {
				if (isCurrent("criteria", request, requestIdentity)) setters.criteria(previous);
				if (identityRef.current === requestIdentity) setError(error instanceof Error ? error.message : String(error));
			}
		},
		[disabled, fields.criteria, isCurrent, onSaved, setError, setters, task],
	);

	const toggleDefinitionOfDone = useCallback(
		async (index: number, checked: boolean) => {
			if (disabled || !task) return;
			const previous = fields.definitionOfDone ?? [];
			const next = previous.map((item) => (item.index === index ? { ...item, checked } : item));
			const requestIdentity = identityRef.current;
			const request = (requestRef.current.get("definitionOfDone") ?? 0) + 1;
			requestRef.current.set("definitionOfDone", request);
			setters.definitionOfDone(next);
			try {
				const updates: TaskUpdatePayload = checked
					? { definitionOfDoneCheck: [index] }
					: { definitionOfDoneUncheck: [index] };
				await apiClient.updateTask(task.id, updates);
				if (identityRef.current === requestIdentity) await onSaved?.();
			} catch (error) {
				if (isCurrent("definitionOfDone", request, requestIdentity)) setters.definitionOfDone(previous);
				if (identityRef.current === requestIdentity) setError(error instanceof Error ? error.message : String(error));
			}
		},
		[disabled, fields.definitionOfDone, isCurrent, onSaved, setError, setters, task],
	);

	const updateType = useCallback(
		async (nextType: string) => {
			if (disabled) return;
			if (!task) {
				setters.taskType(nextType);
				setTypeError(null);
				return;
			}
			if (typeUpdating) return;
			const previous = fields.taskType;
			const requestIdentity = identityRef.current;
			const request = (requestRef.current.get("taskType") ?? 0) + 1;
			requestRef.current.set("taskType", request);
			setTypeUpdating(true);
			setTypeError(null);
			setters.taskType(nextType);
			try {
				const updated = await apiClient.updateTask(task.id, { type: nextType });
				if (!isCurrent("taskType", request, requestIdentity)) return;
				setters.taskType(updated.type ?? "");
				await onSaved?.();
			} catch (error) {
				if (!isCurrent("taskType", request, requestIdentity)) return;
				setters.taskType(previous);
				setTypeError(error instanceof Error ? error.message : String(error));
			} finally {
				if (isCurrent("taskType", request, requestIdentity)) setTypeUpdating(false);
			}
		},
		[disabled, fields.taskType, isCurrent, onSaved, setters, task, typeUpdating],
	);

	return { update, toggleCriterion, toggleDefinitionOfDone, updateType, typeError, typeUpdating };
}
