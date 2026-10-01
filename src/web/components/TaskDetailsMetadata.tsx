import { type ReactNode, useEffect, useState } from "react";
import { DEFAULT_STATUSES } from "../../constants/index.ts";
import type { Milestone, Task } from "../../types";
import { TASK_FIELD_LABELS } from "../../ui/task-labels";
import type { TaskReadiness } from "../../utils/readiness";
import { formatReadinessBlockers } from "../../utils/readiness";
import type { TaskDetailFormState } from "../hooks/use-task-detail-form-state";
import { apiClient } from "../lib/api";
import { matchesBrowserShortcut } from "../lib/keyboard-shortcuts";
import { resolveMilestoneLabel } from "../utils/milestone-aliases";
import ChipInput from "./ChipInput";
import StoredDate from "./StoredDate";
import { TaskDependenciesSection } from "./TaskDependenciesSection";
import { type TaskDetailsMode, TaskDetailsSectionHeader } from "./TaskDetailsContent";

type InlineUpdate = (updates: Omit<Partial<Task>, "milestone"> & { milestone?: string | null }) => void | Promise<void>;
type MetadataState = Pick<
	TaskDetailFormState,
	| "title"
	| "status"
	| "assignee"
	| "labels"
	| "priority"
	| "taskType"
	| "project"
	| "milestone"
	| "dueDate"
	| "dependencies"
>;

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

const StatusSelect = ({
	current,
	onChange,
	disabled,
}: {
	current: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) => {
	const [statuses, setStatuses] = useState<string[]>([]);
	useEffect(() => {
		apiClient
			.fetchStatuses()
			.then(setStatuses)
			.catch(() => setStatuses([...DEFAULT_STATUSES]));
	}, []);
	const options = !current || statuses.includes(current) ? statuses : [current, ...statuses];
	return (
		<select
			className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
			value={current}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
		>
			{options.map((status) => (
				<option key={status} value={status}>
					{status}
				</option>
			))}
		</select>
	);
};

const MetadataCard = ({ children }: { children: ReactNode }) => (
	<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">{children}</div>
);

function TaskMetadataDates({
	task,
	mode,
	dueDate,
	onDueDateChange,
	dateFormat,
}: Pick<Props, "task" | "mode" | "dateFormat"> & { dueDate: string; onDueDateChange: (value: string) => void }) {
	return (
		<>
			{task && (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
					<div>
						<span className="font-semibold text-gray-800 dark:text-gray-100">Created:</span>{" "}
						<StoredDate value={task.createdDate} dateFormat={dateFormat} className="text-gray-700 dark:text-gray-200" />
					</div>
					{task.updatedDate && (
						<div>
							<span className="font-semibold text-gray-800 dark:text-gray-100">Updated:</span>{" "}
							<StoredDate
								value={task.updatedDate}
								dateFormat={dateFormat}
								className="text-gray-700 dark:text-gray-200"
							/>
						</div>
					)}
					{task.dueDate && mode === "preview" && (
						<div>
							<span className="font-semibold text-gray-800 dark:text-gray-100">Due:</span>{" "}
							<StoredDate value={task.dueDate} dateFormat={dateFormat} className="text-gray-700 dark:text-gray-200" />
						</div>
					)}
				</div>
			)}
			{mode !== "preview" && (
				<MetadataCard>
					<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.DUE} />
					<input
						type="date"
						value={dueDate}
						onChange={(event) => onDueDateChange(event.target.value)}
						className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
					/>
				</MetadataCard>
			)}
		</>
	);
}

function TaskMetadataIdentity({
	task,
	isFromOtherBranch,
	isOpenDraft,
	state,
	priorityOptions,
	onChange,
	onInlineMetaUpdate,
}: Pick<
	Props,
	"task" | "isFromOtherBranch" | "isOpenDraft" | "state" | "priorityOptions" | "onChange" | "onInlineMetaUpdate"
>) {
	const { title, status, assignee, labels, priority } = state;
	return (
		<>
			{task && (
				<MetadataCard>
					<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.TITLE} />
					<input
						type="text"
						value={title}
						onChange={(e) => onChange.title(e.target.value)}
						onBlur={() => {
							if (title.trim() && title !== task.title) void onInlineMetaUpdate({ title: title.trim() });
						}}
						onKeyDown={(e) => {
							if (matchesBrowserShortcut(e, "confirmTaskTitle")) e.currentTarget.blur();
						}}
						disabled={isFromOtherBranch}
						className={`w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`}
					/>
				</MetadataCard>
			)}
			<MetadataCard>
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.STATUS} />
				<StatusSelect
					current={status}
					onChange={(value) => void onInlineMetaUpdate({ status: value })}
					disabled={isFromOtherBranch || isOpenDraft}
				/>
			</MetadataCard>
			<MetadataCard>
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.ASSIGNEE} />
				<ChipInput
					name="assignee"
					label=""
					value={assignee}
					onChange={(value) => void onInlineMetaUpdate({ assignee: value })}
					placeholder="Type name and press Enter"
					disabled={isFromOtherBranch}
				/>
			</MetadataCard>
			<MetadataCard>
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.LABELS} />
				<ChipInput
					name="labels"
					label=""
					value={labels}
					onChange={(value) => void onInlineMetaUpdate({ labels: value })}
					placeholder="Type label and press Enter or comma"
					disabled={isFromOtherBranch}
				/>
			</MetadataCard>
			<MetadataCard>
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.PRIORITY} />
				<select
					className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`}
					value={priority}
					onChange={(e) => void onInlineMetaUpdate({ priority: e.target.value })}
					disabled={isFromOtherBranch}
				>
					<option value="">No Priority</option>
					{priorityOptions.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</MetadataCard>
		</>
	);
}

function TaskMetadataType({
	state,
	typeOptions,
	typeSelectionValue,
	canonicalTypeSelection,
	typeUpdateError,
	isTypeUpdating,
	isFromOtherBranch,
	onTaskTypeChange,
}: Pick<
	Props,
	| "state"
	| "typeOptions"
	| "typeSelectionValue"
	| "canonicalTypeSelection"
	| "typeUpdateError"
	| "isTypeUpdating"
	| "isFromOtherBranch"
	| "onTaskTypeChange"
>) {
	const { taskType } = state;
	return (
		<MetadataCard>
			<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.TYPE} />
			<select
				aria-label="Task type"
				aria-invalid={typeUpdateError ? true : undefined}
				aria-describedby={typeUpdateError ? "task-type-update-error" : undefined}
				className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch || isTypeUpdating ? "opacity-60 cursor-not-allowed" : ""}`}
				value={typeSelectionValue}
				onChange={(event) => onTaskTypeChange(event.target.value)}
				disabled={isFromOtherBranch || isTypeUpdating}
			>
				<option value="">No type</option>
				{!canonicalTypeSelection && taskType.trim() ? (
					<option value={taskType}>{taskType} (not configured)</option>
				) : null}
				{typeOptions.map((typeOption) => (
					<option key={typeOption} value={typeOption}>
						{typeOption}
					</option>
				))}
			</select>
			{typeUpdateError ? (
				<p id="task-type-update-error" role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
					{typeUpdateError}
				</p>
			) : null}
		</MetadataCard>
	);
}

function TaskMetadataProject({
	state,
	projectOptions,
	projectSelectionValue,
	canonicalProjectSelection,
	isFromOtherBranch,
	onInlineMetaUpdate,
}: Pick<
	Props,
	| "state"
	| "projectOptions"
	| "projectSelectionValue"
	| "canonicalProjectSelection"
	| "isFromOtherBranch"
	| "onInlineMetaUpdate"
>) {
	const { project } = state;
	if (projectOptions.length === 0) return null;
	return (
		<MetadataCard>
			<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.PROJECT} />
			<select
				className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`}
				aria-label="Task project"
				value={projectSelectionValue}
				onChange={(e) => void onInlineMetaUpdate({ project: e.target.value })}
				disabled={isFromOtherBranch}
			>
				<option value="">No Project</option>
				{!canonicalProjectSelection && project.trim() ? (
					<option value={project}>{project} (not configured)</option>
				) : null}
				{projectOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</MetadataCard>
	);
}

function TaskMetadataMilestone({
	milestoneSelectionValue,
	hasMilestoneSelection,
	milestoneEntities,
	archivedMilestoneEntities,
	isFromOtherBranch,
	onChange,
	onInlineMetaUpdate,
}: Pick<
	Props,
	| "milestoneSelectionValue"
	| "hasMilestoneSelection"
	| "milestoneEntities"
	| "archivedMilestoneEntities"
	| "isFromOtherBranch"
	| "onChange"
	| "onInlineMetaUpdate"
>) {
	return (
		<MetadataCard>
			<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.MILESTONE} />
			<select
				className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? "opacity-60 cursor-not-allowed" : ""}`}
				value={milestoneSelectionValue}
				onChange={(e) => {
					const value = e.target.value;
					onChange.milestone(value);
					void onInlineMetaUpdate({ milestone: value.trim().length > 0 ? value : null });
				}}
				disabled={isFromOtherBranch}
			>
				<option value="">No milestone</option>
				{!hasMilestoneSelection && milestoneSelectionValue ? (
					<option value={milestoneSelectionValue}>
						{resolveMilestoneLabel(milestoneSelectionValue, milestoneEntities ?? [], archivedMilestoneEntities ?? [])}
					</option>
				) : null}
				{(milestoneEntities ?? []).map((milestoneEntity) => (
					<option key={milestoneEntity.id} value={milestoneEntity.id}>
						{milestoneEntity.title}
					</option>
				))}
			</select>
		</MetadataCard>
	);
}

function TaskMetadataSelections(
	props: Pick<
		Props,
		| "state"
		| "typeOptions"
		| "projectOptions"
		| "typeSelectionValue"
		| "canonicalTypeSelection"
		| "projectSelectionValue"
		| "canonicalProjectSelection"
		| "milestoneSelectionValue"
		| "hasMilestoneSelection"
		| "milestoneEntities"
		| "archivedMilestoneEntities"
		| "typeUpdateError"
		| "isTypeUpdating"
		| "isFromOtherBranch"
		| "onChange"
		| "onInlineMetaUpdate"
		| "onTaskTypeChange"
	>,
) {
	return (
		<>
			<TaskMetadataType {...props} />
			<TaskMetadataProject {...props} />
			<TaskMetadataMilestone {...props} />
		</>
	);
}

export const TaskDetailsMetadata = (props: Props) => {
	const {
		task,
		state,
		availableTasks,
		localAvailableTasks,
		shownReadiness,
		demoting,
		isFromOtherBranch,
		onInlineMetaUpdate,
		onArchive,
		hasArchiveAction,
		dateFormat,
	} = props;
	const { dueDate, dependencies } = state;
	return (
		<div className="md:col-span-1 space-y-4">
			<TaskMetadataDates
				task={task}
				mode={props.mode}
				dueDate={dueDate}
				onDueDateChange={props.onChange.dueDate}
				dateFormat={dateFormat}
			/>
			<TaskMetadataIdentity {...props} />
			<TaskMetadataSelections {...props} />
			<TaskDependenciesSection
				dependencies={dependencies}
				availableTasks={availableTasks}
				suggestableTasks={localAvailableTasks}
				currentTaskId={task?.id}
				disabled={isFromOtherBranch}
				readiness={
					shownReadiness
						? {
								isReady: shownReadiness.isReady,
								message: shownReadiness.isReady ? "Ready to start" : formatReadinessBlockers(shownReadiness),
							}
						: null
				}
				onChange={(value) => void onInlineMetaUpdate({ dependencies: value })}
			/>
			{task && hasArchiveAction && !isFromOtherBranch && (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
					<button
						type="button"
						onClick={onArchive}
						title="Archive canceled, duplicate, or invalid work"
						disabled={demoting}
						className="w-full inline-flex items-center justify-center px-4 py-2 bg-red-500 dark:bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-600 dark:hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-red-400 dark:focus:ring-red-500 transition-colors duration-200"
					>
						<svg aria-hidden="true" className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
							/>
						</svg>
						Archive Task
					</button>
				</div>
			)}
		</div>
	);
};
