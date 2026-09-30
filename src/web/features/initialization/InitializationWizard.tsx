import {
	AdvancedConfigForm,
	AgentFilesForm,
	IntegrationModeForm,
	McpClientsForm,
	ProjectNameForm,
} from "./InitializationStepForms";
import { InitializationStepView } from "./InitializationStepView";
import { useInitializationWizard } from "./use-initialization-wizard";

export type IntegrationMode = "mcp" | "cli" | "none";
export type BacklogDirectoryChoice = "backlog" | ".backlog" | "custom";
export type ConfigLocationChoice = "folder" | "root";
export type WizardStep = "projectName" | "integrationMode" | "mcpClients" | "agentFiles" | "advancedConfig" | "summary";

export interface AdvancedConfig {
	checkActiveBranches: boolean;
	remoteOperations: boolean;
	activeBranchDays: number;
	bypassGitHooks: boolean;
	autoCommit: boolean;
	zeroPaddedIds: number | null;
	taskPrefix: string;
	defaultEditor: string;
	defaultPort: number;
	autoOpenBrowser: boolean;
}

export function InitializationWizard({ onInitialized }: { onInitialized: () => void }) {
	const wizard = useInitializationWizard(onInitialized);
	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors duration-200 p-4">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-2xl w-full">
				<header className="text-center mb-6">
					<div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-3">
						✓
					</div>
					<h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Initialize Backlog.md</h1>
				</header>
				<StepIndicator step={wizard.currentStep} />
				{wizard.error && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-400">{wizard.error}</p>
					</div>
				)}
				<div className="mb-8">
					{wizard.currentStep === "projectName" && (
						<ProjectNameForm projectName={wizard.projectName} setProjectName={wizard.setProjectName} />
					)}
					{wizard.currentStep === "integrationMode" && (
						<IntegrationModeForm
							integrationMode={wizard.integrationMode}
							setIntegrationMode={wizard.setIntegrationMode}
						/>
					)}
					{wizard.currentStep === "mcpClients" && (
						<McpClientsForm selected={wizard.selectedMcpClients} toggle={wizard.toggleMcpClient} />
					)}
					{wizard.currentStep === "agentFiles" && (
						<AgentFilesForm
							selected={wizard.selectedAgentFiles}
							toggle={wizard.toggleAgentFile}
							installClaudeAgent={wizard.installClaudeAgent}
							setInstallClaudeAgent={wizard.setInstallClaudeAgent}
						/>
					)}
					{wizard.currentStep === "advancedConfig" && (
						<AdvancedConfigForm
							backlogDirectorySource={wizard.backlogDirectorySource}
							setBacklogDirectorySource={wizard.setBacklogDirectorySource}
							backlogDirectory={wizard.backlogDirectory}
							setBacklogDirectory={wizard.setBacklogDirectory}
							configLocation={wizard.configLocation}
							setConfigLocation={wizard.setConfigLocation}
							rootConfigPath={wizard.rootConfigPath}
							showAdvancedConfig={wizard.showAdvancedConfig}
							setShowAdvancedConfig={wizard.setShowAdvancedConfig}
							advancedConfig={wizard.advancedConfig}
							setAdvancedConfig={wizard.setAdvancedConfig}
						/>
					)}
					{wizard.currentStep === "summary" && (
						<InitializationStepView
							projectName={wizard.projectName}
							integrationMode={wizard.integrationMode}
							backlogDirectory={wizard.backlogDirectory}
							configLocation={wizard.configLocation}
							selectedMcpClients={wizard.selectedMcpClients}
							selectedAgentFiles={wizard.selectedAgentFiles}
							installClaudeAgent={wizard.installClaudeAgent}
							showAdvancedConfig={wizard.showAdvancedConfig}
							advancedConfig={wizard.advancedConfig}
							mcpSetupResults={{}}
						/>
					)}
				</div>
				<nav className="flex justify-between">
					<button
						type="button"
						onClick={wizard.back}
						disabled={wizard.currentStep === "projectName" || wizard.isInitializing}
						className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors duration-200"
					>
						Back
					</button>
					<button
						type="button"
						onClick={wizard.currentStep === "summary" ? wizard.initialize : wizard.next}
						disabled={wizard.currentStep === "summary" ? wizard.isInitializing : !wizard.canProceed}
						className="px-6 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200 font-medium"
					>
						{wizard.currentStep === "summary" && wizard.isInitializing
							? "Initializing..."
							: wizard.currentStep === "summary"
								? "Initialize Project"
								: "Next"}
					</button>
				</nav>
			</div>
		</div>
	);
}

function StepIndicator({ step }: { step: WizardStep }) {
	const steps = ["Project", "Integration", "Setup", "Config", "Initialize"];
	const index = (
		{
			projectName: 0,
			integrationMode: 1,
			mcpClients: 2,
			agentFiles: 2,
			advancedConfig: 3,
			summary: 4,
		} satisfies Record<WizardStep, number>
	)[step];
	return (
		<div className="flex justify-center mb-8">
			{steps.map((name, position) => (
				<div key={name} className="flex items-center">
					<div
						className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${position <= index ? "bg-blue-500 dark:bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}
					>
						{position + 1}
					</div>
					{position < steps.length - 1 && (
						<div
							className={`w-12 h-1 mx-1 ${position < index ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-200 dark:bg-gray-700"}`}
						/>
					)}
				</div>
			))}
		</div>
	);
}
