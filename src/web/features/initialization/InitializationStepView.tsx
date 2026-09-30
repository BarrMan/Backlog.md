import type { AdvancedConfig, ConfigLocationChoice, IntegrationMode } from "./InitializationWizard";

interface InitializationStepViewProps {
	projectName: string;
	integrationMode: IntegrationMode | null;
	backlogDirectory: string;
	configLocation: ConfigLocationChoice;
	selectedMcpClients: string[];
	selectedAgentFiles: string[];
	installClaudeAgent: boolean;
	showAdvancedConfig: boolean;
	advancedConfig: AdvancedConfig;
	mcpSetupResults: Record<string, string>;
}

interface SummaryRowData {
	label: string;
	value: string;
	valueClassName?: string;
}

export function InitializationStepView({
	projectName,
	integrationMode,
	backlogDirectory,
	configLocation,
	selectedMcpClients,
	selectedAgentFiles,
	installClaudeAgent,
	showAdvancedConfig,
	advancedConfig,
	mcpSetupResults,
}: InitializationStepViewProps) {
	const rows = createSummaryRows({
		projectName,
		integrationMode,
		backlogDirectory,
		configLocation,
		selectedMcpClients,
		selectedAgentFiles,
		installClaudeAgent,
		showAdvancedConfig,
		advancedConfig,
	});

	return (
		<div>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Ready to Initialize</h2>
			<p className="text-gray-600 dark:text-gray-400 mb-6">Review your configuration before initializing:</p>

			<div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3 text-sm">
				{rows.map(({ label, value, valueClassName }) => (
					<SummaryRow key={label} label={label} value={value} valueClassName={valueClassName} />
				))}
			</div>

			{Object.keys(mcpSetupResults).length > 0 ? (
				<div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
					<h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Setup Progress:</h3>
					{Object.entries(mcpSetupResults).map(([client, result]) => (
						<div key={client} className="text-sm text-blue-700 dark:text-blue-400">
							{client}: {result}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function createSummaryRows({
	projectName,
	integrationMode,
	backlogDirectory,
	configLocation,
	selectedMcpClients,
	selectedAgentFiles,
	installClaudeAgent,
	showAdvancedConfig,
	advancedConfig,
}: Omit<InitializationStepViewProps, "mcpSetupResults">): SummaryRowData[] {
	const rows: SummaryRowData[] = [
		{ label: "Project Name", value: projectName },
		{
			label: "Integration Mode",
			value: integrationMode === "mcp" ? "MCP Connector" : integrationMode === "cli" ? "CLI Commands" : "None",
		},
		{ label: "Backlog Directory", value: backlogDirectory },
		{
			label: "Config Location",
			value: configLocation === "root" ? "backlog.config.yml" : `${backlogDirectory}/config.yml`,
		},
	];
	if (integrationMode === "mcp" && selectedMcpClients.length > 0)
		rows.push({ label: "MCP Clients", value: selectedMcpClients.join(", ") });
	if (integrationMode === "cli" && selectedAgentFiles.length > 0)
		rows.push({ label: "Agent Files", value: `${selectedAgentFiles.length} files` });
	if (integrationMode === "cli" && installClaudeAgent)
		rows.push({
			label: "Claude Agent",
			value: "Will be installed",
			valueClassName: "text-green-600 dark:text-green-400",
		});
	rows.push({ label: "Advanced Config", value: showAdvancedConfig ? "Customized" : "Defaults" });
	if (showAdvancedConfig && advancedConfig.taskPrefix)
		rows.push({ label: "Task Prefix", value: advancedConfig.taskPrefix.toUpperCase() });
	return rows;
}

function SummaryRow({
	label,
	value,
	valueClassName = "text-gray-900 dark:text-gray-100",
}: {
	label: string;
	value: string;
	valueClassName?: string;
}) {
	return (
		<div className="flex justify-between">
			<span className="text-gray-600 dark:text-gray-400">{label}:</span>
			<span className={`font-medium ${valueClassName}`}>{value}</span>
		</div>
	);
}
