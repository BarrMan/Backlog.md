import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type {
	AdvancedConfig,
	BacklogDirectoryChoice,
	ConfigLocationChoice,
	IntegrationMode,
} from "./InitializationWizard";

export type McpClient = "claude" | "codex" | "gemini" | "guide";
export type AgentFile = "CLAUDE.md" | "AGENTS.md" | "GEMINI.md" | ".github/copilot-instructions.md";

const cardClass = (selected: boolean) =>
	`flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
		selected
			? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
			: "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"
	}`;

export function ProjectNameForm({
	projectName,
	setProjectName,
}: {
	projectName: string;
	setProjectName: Dispatch<SetStateAction<string>>;
}) {
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Project Name</h2>
			<p className="text-gray-600 dark:text-gray-400 mb-6">
				Enter a name for your project. This will be displayed in the UI and used for identification.
			</p>
			<input
				type="text"
				value={projectName}
				onChange={(event) => setProjectName(event.target.value)}
				placeholder="My Awesome Project"
				className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 transition-colors duration-200"
			/>
		</div>
	);
}

export function IntegrationModeForm({
	integrationMode,
	setIntegrationMode,
}: {
	integrationMode: IntegrationMode | null;
	setIntegrationMode: Dispatch<SetStateAction<IntegrationMode | null>>;
}) {
	const modes: { id: IntegrationMode; title: string; description: string }[] = [
		{
			id: "mcp",
			title: "MCP Connector (Recommended)",
			description:
				"For Claude Code, Codex, Gemini CLI, Kiro, Cursor, etc. Agents learn the Backlog.md workflow through MCP tools, resources, and prompts.",
		},
		{
			id: "cli",
			title: "CLI Commands (Broader Compatibility)",
			description:
				"Agents will use Backlog.md by invoking CLI commands directly. Creates instruction files for various AI tools.",
		},
		{
			id: "none",
			title: "Skip for Now",
			description: "Continue without setting up AI integration. You can configure this later.",
		},
	];
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">AI Integration Mode</h2>
			<p className="text-gray-600 dark:text-gray-400 mb-6">
				How would you like your AI tools to connect to Backlog.md?
			</p>
			<div className="space-y-3">
				{modes.map(({ id, title, description }) => (
					<label key={id} className={cardClass(integrationMode === id)}>
						<input
							type="radio"
							name="integrationMode"
							value={id}
							checked={integrationMode === id}
							onChange={() => setIntegrationMode(id)}
							className="mt-1 mr-3"
						/>
						<div>
							<div className="font-medium text-gray-900 dark:text-gray-100">{title}</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">{description}</div>
						</div>
					</label>
				))}
			</div>
		</div>
	);
}

export function McpClientsForm({ selected, toggle }: { selected: McpClient[]; toggle: (client: McpClient) => void }) {
	const clients: { id: McpClient; label: string; description: string }[] = [
		{ id: "claude", label: "Claude Code", description: "Anthropic's Claude Code editor" },
		{ id: "codex", label: "OpenAI Codex", description: "OpenAI's Codex CLI" },
		{ id: "gemini", label: "Gemini CLI", description: "Google's Gemini Code Assist CLI" },
		{ id: "guide", label: "Manual Setup Guide", description: "Opens documentation for manual configuration" },
	];
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">MCP Client Setup</h2>
			<p className="text-gray-600 dark:text-gray-400 mb-6">
				Select the AI tools you want to configure for MCP integration. The setup will run automatically.
			</p>
			<div className="space-y-3">
				{clients.map((client) => (
					<label key={client.id} className={cardClass(selected.includes(client.id))}>
						<input
							type="checkbox"
							checked={selected.includes(client.id)}
							onChange={() => toggle(client.id)}
							className="mt-1 mr-3"
						/>
						<div>
							<div className="font-medium text-gray-900 dark:text-gray-100">{client.label}</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">{client.description}</div>
						</div>
					</label>
				))}
			</div>
			{selected.length === 0 && (
				<p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
					💡 Select at least one option to configure MCP integration, or go back to choose a different mode.
				</p>
			)}
		</div>
	);
}

export function AgentFilesForm({
	selected,
	toggle,
	installClaudeAgent,
	setInstallClaudeAgent,
}: {
	selected: AgentFile[];
	toggle: (file: AgentFile) => void;
	installClaudeAgent: boolean;
	setInstallClaudeAgent: Dispatch<SetStateAction<boolean>>;
}) {
	const files: { id: AgentFile; label: string; description: string }[] = [
		{ id: "CLAUDE.md", label: "CLAUDE.md", description: "Claude Code instructions" },
		{
			id: "AGENTS.md",
			label: "AGENTS.md",
			description: "Codex, Cursor (uses AGENTS.md), Zed, Warp, Aider, RooCode, etc.",
		},
		{ id: "GEMINI.md", label: "GEMINI.md", description: "Google Gemini Code Assist CLI" },
		{ id: ".github/copilot-instructions.md", label: "Copilot Instructions", description: "GitHub Copilot" },
	];
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Agent Instruction Files</h2>
			<p className="text-gray-600 dark:text-gray-400 mb-6">
				Select which instruction files to create for CLI-based AI tools.
			</p>
			<div className="space-y-3">
				{files.map((file) => (
					<label key={file.id} className={cardClass(selected.includes(file.id))}>
						<input
							type="checkbox"
							checked={selected.includes(file.id)}
							onChange={() => toggle(file.id)}
							className="mt-1 mr-3"
						/>
						<div>
							<div className="font-medium text-gray-900 dark:text-gray-100">{file.label}</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">{file.description}</div>
						</div>
					</label>
				))}
			</div>
			<div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
				<label className="flex items-start cursor-pointer">
					<input
						type="checkbox"
						checked={installClaudeAgent}
						onChange={(event) => setInstallClaudeAgent(event.target.checked)}
						className="mt-1 mr-3"
					/>
					<div>
						<div className="font-medium text-gray-900 dark:text-gray-100">Install Claude Code Backlog.md Agent</div>
						<div className="text-sm text-gray-500 dark:text-gray-400">
							Adds configuration under .claude/agents/ for enhanced Claude Code integration
						</div>
					</div>
				</label>
			</div>
		</div>
	);
}

export function AdvancedConfigForm({
	backlogDirectorySource,
	setBacklogDirectorySource,
	backlogDirectory,
	setBacklogDirectory,
	configLocation,
	setConfigLocation,
	rootConfigPath,
	showAdvancedConfig,
	setShowAdvancedConfig,
	advancedConfig,
	setAdvancedConfig,
}: {
	backlogDirectorySource: BacklogDirectoryChoice;
	setBacklogDirectorySource: Dispatch<SetStateAction<BacklogDirectoryChoice>>;
	backlogDirectory: string;
	setBacklogDirectory: Dispatch<SetStateAction<string>>;
	configLocation: ConfigLocationChoice;
	setConfigLocation: Dispatch<SetStateAction<ConfigLocationChoice>>;
	rootConfigPath: string | null;
	showAdvancedConfig: boolean;
	setShowAdvancedConfig: Dispatch<SetStateAction<boolean>>;
	advancedConfig: AdvancedConfig;
	setAdvancedConfig: Dispatch<SetStateAction<AdvancedConfig>>;
}) {
	const update = (change: Partial<AdvancedConfig>) => setAdvancedConfig((previous) => ({ ...previous, ...change }));
	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Advanced Settings</h2>
			<div className="mb-6">
				<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Backlog Folder</h3>
				{(["backlog", ".backlog", "custom"] as BacklogDirectoryChoice[]).map((option) => (
					<label key={option} className={`${cardClass(backlogDirectorySource === option)} mb-3`}>
						<input
							type="radio"
							name="backlogDirectorySource"
							value={option}
							checked={backlogDirectorySource === option}
							onChange={() => {
								setBacklogDirectorySource(option);
								if (option !== "custom") setBacklogDirectory(option);
								if (option === "custom") setConfigLocation("root");
							}}
							className="mt-1 mr-3"
						/>
						<div>
							<div className="font-medium text-gray-900 dark:text-gray-100">
								{option === "custom" ? "Custom project-relative path" : `${option}/`}
							</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">
								{option === "custom"
									? `Use ${rootConfigPath ?? "backlog.config.yml"} as the project-root pointer file`
									: `Store tasks and config in ${option}/`}
							</div>
						</div>
					</label>
				))}
				{backlogDirectorySource === "custom" ? (
					<div className="mt-4">
						<label htmlFor="backlogDirectory" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
							Project-relative backlog directory
						</label>
						<input
							id="backlogDirectory"
							type="text"
							value={backlogDirectory}
							onChange={(event) => setBacklogDirectory(event.target.value)}
							placeholder="e.g. planning/backlog"
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
						/>
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
							This path is stored in {rootConfigPath ?? "backlog.config.yml"} and resolved from the project root.
						</p>
					</div>
				) : (
					<div className="mt-4">
						<fieldset>
							<legend className="block text-sm text-gray-700 dark:text-gray-300 mb-3">Config Location</legend>
							{(["folder", "root"] as ConfigLocationChoice[]).map((option) => (
								<label key={option} className={`${cardClass(configLocation === option)} mb-3`}>
									<input
										type="radio"
										name="configLocation"
										value={option}
										checked={configLocation === option}
										onChange={() => setConfigLocation(option)}
										className="mt-1 mr-3"
									/>
									<div>
										<div className="font-medium text-gray-900 dark:text-gray-100">
											{option === "root" ? "backlog.config.yml" : `${backlogDirectory}/config.yml`}
										</div>
										<div className="text-sm text-gray-500 dark:text-gray-400">
											{option === "root"
												? "Store config in the project root and point to the backlog folder there"
												: "Store config inside the backlog folder"}
										</div>
									</div>
								</label>
							))}
						</fieldset>
					</div>
				)}
			</div>
			<label className="flex items-center mb-6 cursor-pointer">
				<input
					type="checkbox"
					checked={showAdvancedConfig}
					onChange={(event) => setShowAdvancedConfig(event.target.checked)}
					className="mr-3"
				/>
				<span className="text-gray-700 dark:text-gray-300">Configure advanced settings now</span>
			</label>
			{showAdvancedConfig && <AdvancedOptions advancedConfig={advancedConfig} update={update} />}
		</div>
	);
}

function AdvancedOptions({
	advancedConfig,
	update,
}: {
	advancedConfig: AdvancedConfig;
	update: (change: Partial<AdvancedConfig>) => void;
}) {
	const number =
		(key: "activeBranchDays" | "zeroPaddedIds" | "defaultPort", fallback: number) =>
		(event: ChangeEvent<HTMLInputElement>) =>
			update({ [key]: Number.parseInt(event.target.value, 10) || fallback } as Partial<AdvancedConfig>);
	return (
		<div className="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
			<section>
				<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Branch Settings</h3>
				<label className="flex items-center cursor-pointer">
					<input
						type="checkbox"
						checked={advancedConfig.checkActiveBranches}
						onChange={(event) =>
							update({
								checkActiveBranches: event.target.checked,
								remoteOperations: event.target.checked ? advancedConfig.remoteOperations : false,
							})
						}
						className="mr-3"
					/>
					<span className="text-gray-900 dark:text-gray-100">Check task states across branches</span>
				</label>
				{advancedConfig.checkActiveBranches && (
					<>
						<label className="flex items-center cursor-pointer ml-6">
							<input
								type="checkbox"
								checked={advancedConfig.remoteOperations}
								onChange={(event) => update({ remoteOperations: event.target.checked })}
								className="mr-3"
							/>
							<span className="text-gray-900 dark:text-gray-100">Include remote branches</span>
						</label>
						<label className="block ml-6 mt-2 text-sm text-gray-700 dark:text-gray-300">
							Active branch days
							<input
								type="number"
								value={advancedConfig.activeBranchDays}
								onChange={number("activeBranchDays", 30)}
								min={1}
								max={365}
								className="ml-3 w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
							/>
						</label>
					</>
				)}
			</section>
			<section>
				<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Git Settings</h3>
				<Checkbox
					label="Auto-commit changes"
					checked={advancedConfig.autoCommit}
					onChange={(checked) => update({ autoCommit: checked })}
				/>
				<Checkbox
					label="Bypass git hooks"
					checked={advancedConfig.bypassGitHooks}
					onChange={(checked) => update({ bypassGitHooks: checked })}
				/>
			</section>
			<section>
				<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">ID Formatting</h3>
				<Checkbox
					label="Zero-padded IDs"
					checked={advancedConfig.zeroPaddedIds !== null}
					onChange={(checked) => update({ zeroPaddedIds: checked ? 3 : null })}
				/>
				{advancedConfig.zeroPaddedIds !== null && (
					<label className="block ml-6 mt-2 text-sm text-gray-700 dark:text-gray-300">
						Number of digits
						<input
							type="number"
							value={advancedConfig.zeroPaddedIds}
							onChange={number("zeroPaddedIds", 3)}
							min={1}
							max={10}
							className="ml-3 w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
						/>
					</label>
				)}
				<label className="block mt-4 text-sm text-gray-700 dark:text-gray-300">
					Task prefix
					<input
						type="text"
						value={advancedConfig.taskPrefix}
						onChange={(event) => update({ taskPrefix: event.target.value.replace(/[^a-zA-Z]/g, "") })}
						placeholder="task"
						className="ml-3 w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
					/>
				</label>
			</section>
			<section>
				<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Editor</h3>
				<input
					type="text"
					value={advancedConfig.defaultEditor}
					onChange={(event) => update({ defaultEditor: event.target.value })}
					placeholder="e.g., code --wait, vim, nano"
					className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
				/>
			</section>
			<section>
				<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Web UI</h3>
				<label className="block text-sm text-gray-700 dark:text-gray-300">
					Default port
					<input
						type="number"
						value={advancedConfig.defaultPort}
						onChange={number("defaultPort", 6420)}
						min={1}
						max={65535}
						className="ml-3 w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
					/>
				</label>
				<Checkbox
					label="Auto-open browser"
					checked={advancedConfig.autoOpenBrowser}
					onChange={(checked) => update({ autoOpenBrowser: checked })}
				/>
			</section>
		</div>
	);
}

function Checkbox({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center cursor-pointer">
			<input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mr-3" />
			<span className="text-gray-900 dark:text-gray-100">{label}</span>
		</label>
	);
}
