import { useEffect, useState } from "react";
import type { Task, Milestone } from "../../types";
import type { TaskReadiness } from "../../utils/readiness";
import type { TaskDetailFormState } from "../hooks/use-task-detail-form-state";
import { apiClient } from "../lib/api";
import { matchesBrowserShortcut } from "../lib/keyboard-shortcuts";
import { formatReadinessBlockers } from "../../utils/readiness";
import { resolveMilestoneLabel } from "../utils/milestone-aliases";
import ChipInput from "./ChipInput";
import StoredDate from "./StoredDate";
import { TaskDependenciesSection } from "./TaskDependenciesSection";
import { TaskDetailsSectionHeader, type TaskDetailsMode } from "./TaskDetailsContent";

type InlineUpdate = (updates: Omit<Partial<Task>, "milestone"> & { milestone?: string | null }) => void | Promise<void>;
type MetadataState = Pick<TaskDetailFormState, "title" | "status" | "assignee" | "labels" | "priority" | "taskType" | "project" | "milestone" | "dueDate" | "dependencies">;

interface Props {
	task?: Task;
	mode: TaskDetailsMode;
	isFromOtherBranch: boolean;
	isOpenDraft: boolean;
	state: MetadataState;
	availableTasks: Task[];
	localAvailableTasks: Task[];
	priorityOptions: { value: string; label: string }[];
	typeOptions: string[];
	projectOptions: string[];
	typeSelectionValue: string;
	canonicalTypeSelection?: string;
	projectSelectionValue: string;
	canonicalProjectSelection?: string;
	milestoneSelectionValue: string;
	hasMilestoneSelection: boolean;
	milestoneEntities?: Milestone[];
	archivedMilestoneEntities?: Milestone[];
	shownReadiness: TaskReadiness | null;
	typeUpdateError: string | null;
	isTypeUpdating: boolean;
	demoting: boolean;
	onChange: {
		title: (value: string) => void;
		milestone: (value: string) => void;
		dueDate: (value: string) => void;
	};
	onInlineMetaUpdate: InlineUpdate;
	onTaskTypeChange: (value: string) => void;
	onArchive: () => void;
	hasArchiveAction: boolean;
	dateFormat?: string;
}

const StatusSelect = ({ current, onChange, disabled }: { current: string; onChange: (value: string) => void; disabled?: boolean }) => {
	const [statuses, setStatuses] = useState<string[]>([]);
	useEffect(() => {
		apiClient.fetchStatuses().then(setStatuses).catch(() => setStatuses(["To Do", "In Progress", "Done"]));
	}, []);
	const options = !current || statuses.includes(current) ? statuses : [current, ...statuses];
	return <select className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${disabled ? "opacity-60 cursor-not-allowed" : ""}`} value={current} onChange={(e) => onChange(e.target.value)} disabled={disabled}>{options.map((status) => <option key={status} value={status}>{status}</option>)}</select>;
};

export const TaskDetailsMetadata = ({ task, mode, isFromOtherBranch, isOpenDraft, state, availableTasks, localAvailableTasks, priorityOptions, typeOptions, projectOptions, typeSelectionValue, canonicalTypeSelection, projectSelectionValue, canonicalProjectSelection, milestoneSelectionValue, hasMilestoneSelection, milestoneEntities, archivedMilestoneEntities, shownReadiness, typeUpdateError, isTypeUpdating, demoting, onChange, onInlineMetaUpdate, onTaskTypeChange, onArchive, hasArchiveAction, dateFormat }: Props) => {
	const { title, status, assignee, labels, priority, taskType, project, dueDate, dependencies } = state;
	return (
		<div className="md:col-span-1 space-y-4">
			{task && <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1"><div><span className="font-semibold text-gray-800 dark:text-gray-100">Created:</span> <StoredDate value={task.createdDate} dateFormat={dateFormat} className="text-gray-700 dark:text-gray-200" /></div>{task.updatedDate && <div><span className="font-semibold text-gray-800 dark:text-gray-100">Updated:</span> <StoredDate value={task.updatedDate} dateFormat={dateFormat} className="text-gray-700 dark:text-gray-200" /></div>}{task.dueDate && mode === "preview" && <div><span className="font-semibold text-gray-800 dark:text-gray-100">Due:</span> <StoredDate value={task.dueDate} dateFormat={dateFormat} className="text-gray-700 dark:text-gray-200" /></div>}</div>}
			{mode !== "preview" && <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Due" /><input type="date" value={dueDate} onChange={(event) => onChange.dueDate(event.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent" /></div>}
			{task && <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Title" /><input type="text" value={title} onChange={(e) => onChange.title(e.target.value)} onBlur={() => { if (title.trim() && title !== task.title) void onInlineMetaUpdate({ title: title.trim() }); }} onKeyDown={(e) => { if (matchesBrowserShortcut(e, "confirmTaskTitle")) e.currentTarget.blur(); }} disabled={isFromOtherBranch} className={`w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`} /></div>}
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Status" /><StatusSelect current={status} onChange={(value) => void onInlineMetaUpdate({ status: value })} disabled={isFromOtherBranch || isOpenDraft} /></div>
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Type" /><select aria-label="Task type" aria-invalid={typeUpdateError ? true : undefined} aria-describedby={typeUpdateError ? "task-type-update-error" : undefined} className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch || isTypeUpdating ? "opacity-60 cursor-not-allowed" : ""}`} value={typeSelectionValue} onChange={(event) => onTaskTypeChange(event.target.value)} disabled={isFromOtherBranch || isTypeUpdating}><option value="">No type</option>{!canonicalTypeSelection && taskType.trim() ? <option value={taskType}>{taskType} (not configured)</option> : null}{typeOptions.map((typeOption) => <option key={typeOption} value={typeOption}>{typeOption}</option>)}</select>{typeUpdateError ? <p id="task-type-update-error" role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{typeUpdateError}</p> : null}</div>
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Assignee" /><ChipInput name="assignee" label="" value={assignee} onChange={(value) => void onInlineMetaUpdate({ assignee: value })} placeholder="Type name and press Enter" disabled={isFromOtherBranch} /></div>
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Labels" /><ChipInput name="labels" label="" value={labels} onChange={(value) => void onInlineMetaUpdate({ labels: value })} placeholder="Type label and press Enter or comma" disabled={isFromOtherBranch} /></div>
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Priority" /><select className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`} value={priority} onChange={(e) => void onInlineMetaUpdate({ priority: e.target.value })} disabled={isFromOtherBranch}><option value="">No Priority</option>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
			{projectOptions.length > 0 && <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Project" /><select className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`} aria-label="Task project" value={projectSelectionValue} onChange={(e) => void onInlineMetaUpdate({ project: e.target.value })} disabled={isFromOtherBranch}><option value="">No Project</option>{!canonicalProjectSelection && project.trim() ? <option value={project}>{project} (not configured)</option> : null}{projectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>}
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><TaskDetailsSectionHeader title="Milestone" /><select className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`} value={milestoneSelectionValue} onChange={(e) => { const value = e.target.value; onChange.milestone(value); void onInlineMetaUpdate({ milestone: value.trim().length > 0 ? value : null }); }} disabled={isFromOtherBranch}><option value="">No milestone</option>{!hasMilestoneSelection && milestoneSelectionValue ? <option value={milestoneSelectionValue}>{resolveMilestoneLabel(milestoneSelectionValue, milestoneEntities ?? [], archivedMilestoneEntities ?? [])}</option> : null}{(milestoneEntities ?? []).map((milestoneEntity) => <option key={milestoneEntity.id} value={milestoneEntity.id}>{milestoneEntity.title}</option>)}</select></div>
			<TaskDependenciesSection dependencies={dependencies} availableTasks={availableTasks} suggestableTasks={localAvailableTasks} currentTaskId={task?.id} disabled={isFromOtherBranch} readiness={shownReadiness ? { isReady: shownReadiness.isReady, message: shownReadiness.isReady ? "Ready to start" : formatReadinessBlockers(shownReadiness) } : null} onChange={(value) => void onInlineMetaUpdate({ dependencies: value })} />
			{task && hasArchiveAction && !isFromOtherBranch && <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"><button onClick={onArchive} title="Archive canceled, duplicate, or invalid work" disabled={demoting} className="w-full inline-flex items-center justify-center px-4 py-2 bg-red-500 dark:bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-600 dark:hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-red-400 dark:focus:ring-red-500 transition-colors duration-200"><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>Archive Task</button></div>}
		</div>
	);
};
