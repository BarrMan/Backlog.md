import type { BacklogConfig } from "../../types";

type ChangeConfig = (field: keyof BacklogConfig, value: BacklogConfig[keyof BacklogConfig]) => void;

const inputClass =
	"w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200";
const selectClass =
	"w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
const descriptionClass = "mt-1 text-sm text-gray-500 dark:text-gray-400";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
			<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
			{children}
		</section>
	);
}

function ToggleSetting({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between">
			<div>
				<span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
				<p className={descriptionClass}>{description}</p>
			</div>
			<div className="relative inline-flex items-center cursor-pointer">
				<input
					type="checkbox"
					checked={checked}
					onChange={(event) => onChange(event.target.checked)}
					className="sr-only peer"
				/>
				<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500" />
			</div>
		</label>
	);
}

export function ProjectSettings({
	config,
	errors,
	change,
}: {
	config: BacklogConfig;
	errors: Record<string, string>;
	change: ChangeConfig;
}) {
	return (
		<SettingsSection title="Project Settings">
			<div className="space-y-4">
				<div>
					<label htmlFor="projectName" className={labelClass}>
						Project Name
					</label>
					<input
						id="projectName"
						type="text"
						value={config.projectName}
						onChange={(event) => change("projectName", event.target.value)}
						className={`${inputClass} ${errors.projectName ? "border-red-500 dark:border-red-400" : "border-gray-300 dark:border-gray-600"}`}
					/>
					{errors.projectName && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.projectName}</p>}
				</div>
				<div>
					<label htmlFor="dateFormat" className={labelClass}>
						Date Format
					</label>
					<select
						id="dateFormat"
						value={config.dateFormat}
						onChange={(event) => change("dateFormat", event.target.value)}
						className={selectClass}
					>
						<option value="yyyy-mm-dd">yyyy-mm-dd</option>
						<option value="dd/mm/yyyy">dd/mm/yyyy</option>
						<option value="mm/dd/yyyy">mm/dd/yyyy</option>
					</select>
					<p className={descriptionClass}>
						Controls how dates are displayed in the web UI and TUI. Dates in markdown files are always stored as
						yyyy-mm-dd.
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}

export function WorkflowSettings({
	config,
	statuses,
	change,
}: {
	config: BacklogConfig;
	statuses: string[];
	change: ChangeConfig;
}) {
	return (
		<SettingsSection title="Workflow Settings">
			<div className="space-y-4">
				<ToggleSetting
					label="Auto Commit"
					description="Automatically commit changes to Git after task operations"
					checked={config.autoCommit ?? false}
					onChange={(value) => change("autoCommit", value)}
				/>
				<ToggleSetting
					label="Remote Operations"
					description="Fetch tasks information from remote branches"
					checked={config.remoteOperations ?? false}
					onChange={(value) => change("remoteOperations", value)}
				/>
				<div>
					<label htmlFor="defaultStatus" className={labelClass}>
						Default Status
					</label>
					<select
						id="defaultStatus"
						value={config.defaultStatus}
						onChange={(event) => change("defaultStatus", event.target.value)}
						className={selectClass}
					>
						{statuses.map((status) => (
							<option key={status} value={status}>
								{status}
							</option>
						))}
					</select>
					<p className={descriptionClass}>Default status for new tasks</p>
				</div>
				<div>
					<label htmlFor="defaultEditor" className={labelClass}>
						Default Editor
					</label>
					<input
						id="defaultEditor"
						type="text"
						value={config.defaultEditor}
						onChange={(event) => change("defaultEditor", event.target.value)}
						className={inputClass}
						placeholder="e.g., vim, nano, code"
					/>
					<p className={descriptionClass}>
						Editor command to use for editing tasks (overrides EDITOR environment variable)
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}

export function DefinitionOfDoneSettings({ config, change }: { config: BacklogConfig; change: ChangeConfig }) {
	const items = config.definitionOfDone ?? [];
	return (
		<SettingsSection title="Definition of Done Defaults">
			<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
				These checklist items are added to new tasks by default.
			</p>
			<div className="space-y-3">
				{items.map((item, index) => (
					<div key={item} className="flex items-center gap-2">
						<input
							type="text"
							value={item}
							onChange={(event) =>
								change(
									"definitionOfDone",
									items.map((current, itemIndex) => (itemIndex === index ? event.target.value : current)),
								)
							}
							className={`flex-1 ${inputClass}`}
							placeholder="Checklist item"
						/>
						<button
							type="button"
							onClick={() =>
								change(
									"definitionOfDone",
									items.filter((_, itemIndex) => itemIndex !== index),
								)
							}
							className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:underline"
						>
							Remove
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={() => change("definitionOfDone", [...items, ""])}
					className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
				>
					+ Add item
				</button>
			</div>
		</SettingsSection>
	);
}

export function WebUiSettings({
	config,
	errors,
	change,
}: {
	config: BacklogConfig;
	errors: Record<string, string>;
	change: ChangeConfig;
}) {
	return (
		<SettingsSection title="Web UI Settings">
			<div className="space-y-4">
				<div>
					<label htmlFor="defaultPort" className={labelClass}>
						Default Port
					</label>
					<input
						id="defaultPort"
						type="number"
						min="1"
						max="65535"
						value={config.defaultPort || 6420}
						onChange={(event) => change("defaultPort", Number.parseInt(event.target.value, 10) || 6420)}
						className={`${inputClass} ${errors.defaultPort ? "border-red-500 dark:border-red-400" : "border-gray-300 dark:border-gray-600"}`}
					/>
					{errors.defaultPort && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.defaultPort}</p>}
				</div>
				<ToggleSetting
					label="Auto Open Browser"
					description="Automatically open browser when starting web UI"
					checked={config.autoOpenBrowser ?? false}
					onChange={(value) => change("autoOpenBrowser", value)}
				/>
				<ToggleSetting
					label="Hide Empty Columns"
					description="Hide board columns whose status has no tasks. Columns reappear while dragging a task so they remain valid drop targets."
					checked={config.hideEmptyColumns ?? false}
					onChange={(value) => change("hideEmptyColumns", value)}
				/>
			</div>
		</SettingsSection>
	);
}

export function AdvancedSettings({ config, change }: { config: BacklogConfig; change: ChangeConfig }) {
	return (
		<SettingsSection title="Advanced Settings">
			<div className="space-y-4">
				<div>
					<label htmlFor="maxColumnWidth" className={labelClass}>
						Max Column Width
					</label>
					<input
						id="maxColumnWidth"
						type="number"
						min="20"
						max="200"
						value={config.maxColumnWidth}
						onChange={(event) => change("maxColumnWidth", Number.parseInt(event.target.value, 10) || 80)}
						className={inputClass}
					/>
					<p className={descriptionClass}>Maximum width for text columns in CLI output</p>
				</div>
				<div>
					<label htmlFor="taskResolutionStrategy" className={labelClass}>
						Task Resolution Strategy
					</label>
					<select
						id="taskResolutionStrategy"
						value={config.taskResolutionStrategy}
						onChange={(event) =>
							change("taskResolutionStrategy", event.target.value as "most_recent" | "most_progressed")
						}
						className={selectClass}
					>
						<option value="most_recent">Most Recent</option>
						<option value="most_progressed">Most Progressed</option>
					</select>
					<p className={descriptionClass}>Strategy for resolving conflicts when tasks exist in multiple branches</p>
				</div>
				<div>
					<label htmlFor="zeroPaddedIds" className={labelClass}>
						Zero-Padded IDs
					</label>
					<input
						id="zeroPaddedIds"
						type="number"
						min="0"
						max="10"
						value={config.zeroPaddedIds || 0}
						onChange={(event) => change("zeroPaddedIds", Number.parseInt(event.target.value, 10) || 0)}
						className={inputClass}
					/>
					<p className={descriptionClass}>
						Number of digits for ID padding (0 = disabled, 3 = task-001, 4 = task-0001)
					</p>
				</div>
				<div>
					<label htmlFor="taskPrefix" className={labelClass}>
						Task Prefix <span className="text-gray-400 dark:text-gray-500 font-normal">(read-only)</span>
					</label>
					<input
						id="taskPrefix"
						type="text"
						value={(config.prefixes?.task || "task").toUpperCase()}
						disabled
						className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
					/>
					<p className={descriptionClass}>
						Set during initialization. Cannot be changed to avoid breaking existing task IDs.
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
