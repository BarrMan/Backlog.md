import MDEditor from "@uiw/react-md-editor";
import type React from "react";
import type { TaskDetail } from "../../core/task-detail";
import type { AcceptanceCriterion, Task, TaskComment } from "../../types";
import { TASK_FIELD_LABELS } from "../../ui/task-labels";
import { summarizeSubtaskProgress } from "../../utils/task-subtasks";
import { isTerminalStatus } from "../../utils/terminal-status";
import type { TaskDetailFormState } from "../hooks/use-task-detail-form-state";
import { createUrlPath } from "../utils/urlHelpers";
import { DependencyGraphSection } from "./DependencyGraphSection";
import MermaidMarkdown from "./MermaidMarkdown";
import { TaskChecklistSection } from "./TaskChecklistSection";
import { TaskCommentsSection } from "./TaskCommentsSection";
import { TaskDetailStringList } from "./TaskDetailStringList";

export type TaskDetailsMode = "preview" | "edit" | "create";
type InlineUpdate = (updates: Omit<Partial<Task>, "milestone"> & { milestone?: string | null }) => void | Promise<void>;

export const TaskDetailsSectionHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
	<div className="flex items-center justify-between mb-3">
		<h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight transition-colors duration-200">
			{title}
		</h3>
		{right ? <div className="ml-2 text-xs text-gray-500 dark:text-gray-400">{right}</div> : null}
	</div>
);

export const HierarchyStatusBadge: React.FC<{ status: string; statuses: string[] }> = ({ status, statuses }) => {
	const normalized = (status ?? "").toLowerCase();
	const tone = isTerminalStatus(status, statuses)
		? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
		: normalized.includes("progress")
			? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
			: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
	return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>;
};

export const HierarchyChevron: React.FC = () => (
	<svg
		className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-gray-500"
		fill="none"
		stroke="currentColor"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	</svg>
);

type ContentState = Pick<
	TaskDetailFormState,
	| "title"
	| "description"
	| "plan"
	| "notes"
	| "finalSummary"
	| "criteria"
	| "definitionOfDone"
	| "references"
	| "modifiedFiles"
	| "displayComments"
	| "commentAuthor"
	| "commentBody"
>;

interface ContentProps {
	task?: Task | TaskDetail;
	mode: TaskDetailsMode;
	isCreateMode: boolean;
	isFromOtherBranch: boolean;
	theme: "light" | "dark";
	state: ContentState;
	availableTasks: Task[];
	availableStatuses: string[];
	dependencyGraph: ReturnType<typeof import("../../core/task-detail").taskDependencyGraph>;
	subtasks: Task[];
	subtaskProgress: ReturnType<typeof import("../../utils/task-subtasks").summarizeSubtaskProgress>;
	onNavigateToTask?: (task: Task) => void;
	onInlineMetaUpdate: InlineUpdate;
	onChange: {
		title: (value: string) => void;
		description: (value: string) => void;
		plan: (value: string) => void;
		notes: (value: string) => void;
		finalSummary: (value: string) => void;
		criteria: (value: AcceptanceCriterion[]) => void;
		definitionOfDone: (value: AcceptanceCriterion[]) => void;
		commentAuthor: (value: string) => void;
		commentBody: (value: string) => void;
	};
	onToggleCriterion: (index: number, checked: boolean) => void;
	onToggleDefinitionOfDone: (index: number, checked: boolean) => void;
	onAddComment: () => void;
	commentSaving: boolean;
	dateFormat?: string;
}

type OverviewProps = Omit<ContentProps, "onAddComment" | "commentSaving" | "dateFormat">;

const TaskDetailsCard = ({ children }: { children: React.ReactNode }) => (
	<div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">{children}</div>
);

function TaskDetailsDescription({
	mode,
	theme,
	description,
	onChange,
}: Pick<OverviewProps, "mode" | "theme" | "onChange"> & Pick<ContentState, "description">) {
	const content =
		mode === "preview" ? (
			description ? (
				<div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
					<MermaidMarkdown source={description} />
				</div>
			) : (
				<div className="text-sm text-gray-500 dark:text-gray-400">No description</div>
			)
		) : (
			<div className="border border-gray-200 dark:border-gray-700 rounded-md">
				<MDEditor
					value={description}
					onChange={(value) => onChange.description(value || "")}
					preview="edit"
					height={320}
					data-color-mode={theme}
				/>
			</div>
		);
	return (
		<TaskDetailsCard>
			<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.DESCRIPTION} />
			{content}
		</TaskDetailsCard>
	);
}

function TaskDetailsSubtasks({
	subtasks,
	subtaskProgress,
	availableTasks,
	availableStatuses,
	onNavigateToTask,
}: Pick<OverviewProps, "subtasks" | "subtaskProgress" | "availableTasks" | "availableStatuses" | "onNavigateToTask">) {
	if (subtasks.length === 0) return null;
	return (
		<section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
			<TaskDetailsSectionHeader
				title="Subtasks"
				right={subtaskProgress ? `${subtaskProgress.completed} of ${subtaskProgress.total} complete` : undefined}
			/>
			<div className="divide-y divide-gray-100 dark:divide-gray-700" data-subtask-list>
				{subtasks.map((subtask) => (
					<TaskDetailsSubtask
						key={subtask.id}
						task={subtask}
						availableTasks={availableTasks}
						availableStatuses={availableStatuses}
						onNavigateToTask={onNavigateToTask}
					/>
				))}
			</div>
		</section>
	);
}

function TaskDetailsSubtask({
	task,
	availableTasks,
	availableStatuses,
	onNavigateToTask,
}: Pick<OverviewProps, "availableTasks" | "availableStatuses" | "onNavigateToTask"> & { task: Task }) {
	const nested = summarizeSubtaskProgress(task, availableTasks, availableStatuses);
	return (
		<button
			type="button"
			onClick={() => onNavigateToTask?.(task)}
			disabled={!onNavigateToTask}
			data-subtask-id={task.id}
			data-subtask-href={createUrlPath("/tasks", task.id, task.title)}
			className="group flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors duration-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-gray-700/50"
			aria-label={`Open subtask ${task.id}: ${task.title} (${task.status})`}
		>
			<span className="min-w-0 flex-1">
				<span className="flex flex-wrap items-center gap-2">
					<span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">{task.id}</span>
					<HierarchyStatusBadge status={task.status} statuses={availableStatuses} />
					{nested && (
						<span
							className="text-xs text-gray-500 dark:text-gray-400"
							data-nested-progress={`${nested.completed}/${nested.total}`}
						>
							{nested.completed} of {nested.total} complete
						</span>
					)}
				</span>
				<span className="mt-1 block break-words text-sm font-medium text-gray-900 dark:text-gray-100">
					{task.title}
				</span>
			</span>
			<HierarchyChevron />
		</button>
	);
}

function TaskDetailsOverview(props: OverviewProps) {
	const {
		task,
		mode,
		isCreateMode,
		isFromOtherBranch,
		theme,
		state,
		dependencyGraph,
		subtasks,
		subtaskProgress,
		availableTasks,
		availableStatuses,
		onNavigateToTask,
		onInlineMetaUpdate,
		onChange,
		onToggleCriterion,
		onToggleDefinitionOfDone,
	} = props;
	const { title, description, criteria, definitionOfDone, references, modifiedFiles } = state;
	const documentation = task?.documentation ?? [];
	return (
		<>
			{isCreateMode ? (
				<TaskDetailsCard>
					<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.TITLE} />
					<input
						type="text"
						value={title}
						onChange={(event) => onChange.title(event.target.value)}
						placeholder="Enter task title"
						className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200"
					/>
				</TaskDetailsCard>
			) : null}
			<TaskDetailsDescription mode={mode} theme={theme} description={description} onChange={onChange} />
			<TaskDetailsSubtasks
				subtasks={subtasks}
				subtaskProgress={subtaskProgress}
				availableTasks={availableTasks}
				availableStatuses={availableStatuses}
				onNavigateToTask={onNavigateToTask}
			/>
			<TaskDetailsCard>
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.REFERENCES} />
				<TaskDetailStringList
					values={references}
					emptyMessage="No references"
					inputName="newRef"
					placeholder="URL or file path..."
					canAdd={mode === "preview" && !isFromOtherBranch}
					canRemove={!isFromOtherBranch}
					removeLabel="Remove reference"
					onChange={(values) => onInlineMetaUpdate({ references: values })}
					renderValue={(reference) =>
						reference.startsWith("http://") || reference.startsWith("https://") ? (
							<a
								href={reference}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
							>
								{reference}
							</a>
						) : (
							<code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
								{reference}
							</code>
						)
					}
				/>
			</TaskDetailsCard>
			<TaskDetailsCard>
				<TaskDetailsSectionHeader
					title={`${TASK_FIELD_LABELS.MODIFIED_FILES}${modifiedFiles.length ? ` (${modifiedFiles.length})` : ""}`}
				/>
				<TaskDetailStringList
					values={modifiedFiles}
					emptyMessage="No modified files"
					inputName="newModifiedFile"
					placeholder="Path from project root..."
					canAdd={mode === "preview" && !isFromOtherBranch}
					canRemove={!isFromOtherBranch}
					listClassName="space-y-2 max-h-64 overflow-y-auto overscroll-contain pr-1"
					removeLabel="Remove modified file"
					onChange={(values) => onInlineMetaUpdate({ modifiedFiles: values })}
					renderValue={(file) => (
						<code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
							{file}
						</code>
					)}
				/>
			</TaskDetailsCard>
			{documentation.length ? (
				<TaskDetailsCard>
					<TaskDetailsSectionHeader title="Documentation" />
					<div className="space-y-2">
						<ul className="space-y-2">
							{documentation.map((doc) => (
								<li key={doc} className="flex items-center gap-3">
									<span className="flex-1 min-w-0">
										{doc.startsWith("http://") || doc.startsWith("https://") ? (
											<a
												href={doc}
												target="_blank"
												rel="noopener noreferrer"
												className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
											>
												{doc}
											</a>
										) : (
											<code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
												{doc}
											</code>
										)}
									</span>
								</li>
							))}
						</ul>
					</div>
				</TaskDetailsCard>
			) : null}
			<TaskChecklistSection
				title={TASK_FIELD_LABELS.ACCEPTANCE_CRITERIA}
				criteria={criteria}
				mode={mode}
				onChange={onChange.criteria}
				onToggle={onToggleCriterion}
				showIndices
				emptyMessage="No acceptance criteria"
			/>
			<TaskChecklistSection
				title={TASK_FIELD_LABELS.DEFINITION_OF_DONE}
				criteria={definitionOfDone}
				mode={mode}
				onChange={onChange.definitionOfDone}
				onToggle={onToggleDefinitionOfDone}
				preserveIndices
				disableToggle={isCreateMode}
				emptyMessage="No Definition of Done items"
			/>
			{dependencyGraph && dependencyGraph.nodes.length > 1 ? (
				<section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
					<TaskDetailsSectionHeader title="Dependency Graph" />
					<DependencyGraphSection graph={dependencyGraph} />
				</section>
			) : null}
		</>
	);
}

function TaskDetailsRecord({
	mode,
	isCreateMode,
	isFromOtherBranch,
	theme,
	state,
	onChange,
	onAddComment,
	commentSaving,
	dateFormat,
}: Pick<
	ContentProps,
	| "mode"
	| "isCreateMode"
	| "isFromOtherBranch"
	| "theme"
	| "state"
	| "onChange"
	| "onAddComment"
	| "commentSaving"
	| "dateFormat"
>) {
	const { plan, notes, finalSummary, displayComments, commentAuthor, commentBody } = state;
	return (
		<>
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.IMPLEMENTATION_PLAN} />
				{mode === "preview" ? (
					plan ? (
						<div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
							<MermaidMarkdown source={plan} />
						</div>
					) : (
						<div className="text-sm text-gray-500 dark:text-gray-400">No plan</div>
					)
				) : (
					<div className="border border-gray-200 dark:border-gray-700 rounded-md">
						<MDEditor
							value={plan}
							onChange={(val) => onChange.plan(val || "")}
							preview="edit"
							height={280}
							data-color-mode={theme}
						/>
					</div>
				)}
			</div>
			<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
				<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.IMPLEMENTATION_NOTES} />
				{mode === "preview" ? (
					notes ? (
						<div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
							<MermaidMarkdown source={notes} />
						</div>
					) : (
						<div className="text-sm text-gray-500 dark:text-gray-400">No notes</div>
					)
				) : (
					<div className="border border-gray-200 dark:border-gray-700 rounded-md">
						<MDEditor
							value={notes}
							onChange={(val) => onChange.notes(val || "")}
							preview="edit"
							height={280}
							data-color-mode={theme}
						/>
					</div>
				)}
			</div>
			{!isCreateMode && (
				<TaskCommentsSection
					comments={displayComments as TaskComment[]}
					mode={mode}
					isReadOnly={isFromOtherBranch}
					theme={theme}
					dateFormat={dateFormat}
					author={commentAuthor}
					body={commentBody}
					saving={commentSaving}
					onAuthorChange={onChange.commentAuthor}
					onBodyChange={onChange.commentBody}
					onAdd={onAddComment}
				/>
			)}
			{(mode !== "preview" || finalSummary.trim().length > 0) && (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
					<TaskDetailsSectionHeader title={TASK_FIELD_LABELS.FINAL_SUMMARY} right="Completion summary" />
					{mode === "preview" ? (
						<div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
							<MermaidMarkdown source={finalSummary} />
						</div>
					) : (
						<div className="border border-gray-200 dark:border-gray-700 rounded-md">
							<MDEditor
								value={finalSummary}
								onChange={(val) => onChange.finalSummary(val || "")}
								preview="edit"
								height={220}
								data-color-mode={theme}
								textareaProps={{
									placeholder: "PR-style summary of what was implemented (write when task is complete)",
								}}
							/>
						</div>
					)}
				</div>
			)}
		</>
	);
}

export const TaskDetailsContent: React.FC<ContentProps> = (props) => (
	<div className="md:col-span-2 space-y-6">
		<TaskDetailsOverview {...props} />
		<TaskDetailsRecord {...props} />
	</div>
);
