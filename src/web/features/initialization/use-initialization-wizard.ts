import { useEffect, useState } from "react";
import { DEFAULT_INIT_CONFIG } from "../../../constants/index.ts";
import { apiClient } from "../../lib/api";
import type { AgentFile, McpClient } from "./InitializationStepForms";
import type {
	AdvancedConfig,
	BacklogDirectoryChoice,
	ConfigLocationChoice,
	IntegrationMode,
	WizardStep,
} from "./InitializationWizard";

function createInitialAdvancedConfig(): AdvancedConfig {
	return {
		checkActiveBranches: DEFAULT_INIT_CONFIG.checkActiveBranches,
		remoteOperations: DEFAULT_INIT_CONFIG.remoteOperations,
		activeBranchDays: DEFAULT_INIT_CONFIG.activeBranchDays,
		bypassGitHooks: DEFAULT_INIT_CONFIG.bypassGitHooks,
		autoCommit: DEFAULT_INIT_CONFIG.autoCommit,
		zeroPaddedIds: DEFAULT_INIT_CONFIG.zeroPaddedIds ?? null,
		taskPrefix: "",
		defaultEditor: DEFAULT_INIT_CONFIG.defaultEditor ?? "",
		defaultPort: DEFAULT_INIT_CONFIG.defaultPort,
		autoOpenBrowser: DEFAULT_INIT_CONFIG.autoOpenBrowser,
	};
}

function normalizeRelativeBacklogDirectory(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed || /^(?:[a-zA-Z]:)?[\\/]/.test(trimmed)) return null;
	const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/g, "");
	return !normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") ? null : normalized;
}

function getNextWizardStep(step: WizardStep, integrationMode: IntegrationMode | null): WizardStep | null {
	if (step === "projectName") return "integrationMode";
	if (step === "integrationMode")
		return integrationMode === "mcp" ? "mcpClients" : integrationMode === "cli" ? "agentFiles" : "advancedConfig";
	return step === "mcpClients" || step === "agentFiles"
		? "advancedConfig"
		: step === "advancedConfig"
			? "summary"
			: null;
}

function getPreviousWizardStep(step: WizardStep, integrationMode: IntegrationMode | null): WizardStep | null {
	if (step === "integrationMode") return "projectName";
	if (step === "mcpClients" || step === "agentFiles") return "integrationMode";
	if (step === "advancedConfig")
		return integrationMode === "mcp" ? "mcpClients" : integrationMode === "cli" ? "agentFiles" : "integrationMode";
	return step === "summary" ? "advancedConfig" : null;
}

export function useInitializationWizard(onInitialized: () => void) {
	const [currentStep, setCurrentStep] = useState<WizardStep>("projectName");
	const [projectName, setProjectName] = useState("");
	const [integrationMode, setIntegrationMode] = useState<IntegrationMode | null>(null);
	const [selectedMcpClients, setSelectedMcpClients] = useState<McpClient[]>([]);
	const [selectedAgentFiles, setSelectedAgentFiles] = useState<AgentFile[]>([]);
	const [installClaudeAgent, setInstallClaudeAgent] = useState(false);
	const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
	const [backlogDirectorySource, setBacklogDirectorySource] = useState<BacklogDirectoryChoice>("backlog");
	const [backlogDirectory, setBacklogDirectory] = useState("backlog");
	const [configLocation, setConfigLocation] = useState<ConfigLocationChoice>("folder");
	const [rootConfigPath, setRootConfigPath] = useState<string | null>(null);
	const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>(createInitialAdvancedConfig);
	const [isInitializing, setIsInitializing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void apiClient
			.checkStatus()
			.then((status) => {
				if (status.initialized) return;
				const source = status.backlogDirectorySource ?? "backlog";
				setRootConfigPath(status.rootConfigPath ?? null);
				setBacklogDirectorySource(source);
				setBacklogDirectory(status.backlogDirectory ?? "backlog");
				setConfigLocation(status.configLocation ?? (source === "custom" ? "root" : "folder"));
			})
			.catch(() => {});
	}, []);

	const next = () => {
		setError(null);
		if (currentStep === "projectName" && !projectName.trim()) return setError("Project name is required");
		if (currentStep === "integrationMode" && !integrationMode) return setError("Please select an integration mode");
		const step = getNextWizardStep(currentStep, integrationMode);
		if (step) setCurrentStep(step);
	};
	const back = () => {
		setError(null);
		const step = getPreviousWizardStep(currentStep, integrationMode);
		if (step) setCurrentStep(step);
	};
	const initialize = async () => {
		setIsInitializing(true);
		setError(null);
		try {
			const usesMcp = integrationMode === "mcp";
			const usesCli = integrationMode === "cli";
			await apiClient.initializeProject({
				projectName: projectName.trim(),
				backlogDirectory:
					backlogDirectorySource === "custom"
						? (normalizeRelativeBacklogDirectory(backlogDirectory) ?? backlogDirectory)
						: backlogDirectory,
				backlogDirectorySource,
				configLocation,
				integrationMode: integrationMode || "none",
				mcpClients: usesMcp ? selectedMcpClients : undefined,
				agentInstructions: usesCli ? selectedAgentFiles : undefined,
				installClaudeAgent: usesCli ? installClaudeAgent : undefined,
				advancedConfig: showAdvancedConfig
					? {
							...advancedConfig,
							zeroPaddedIds: advancedConfig.zeroPaddedIds || undefined,
							taskPrefix: advancedConfig.taskPrefix || undefined,
							defaultEditor: advancedConfig.defaultEditor || undefined,
						}
					: undefined,
			});
			onInitialized();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Failed to initialize project");
			setIsInitializing(false);
		}
	};
	const canProceed =
		currentStep !== "projectName"
			? currentStep !== "integrationMode"
				? currentStep !== "advancedConfig" ||
					backlogDirectorySource !== "custom" ||
					normalizeRelativeBacklogDirectory(backlogDirectory) !== null
				: integrationMode !== null
			: projectName.trim().length > 0;
	return {
		currentStep,
		projectName,
		setProjectName,
		integrationMode,
		setIntegrationMode,
		selectedMcpClients,
		selectedAgentFiles,
		installClaudeAgent,
		setInstallClaudeAgent,
		showAdvancedConfig,
		setShowAdvancedConfig,
		backlogDirectorySource,
		setBacklogDirectorySource,
		backlogDirectory,
		setBacklogDirectory,
		configLocation,
		setConfigLocation,
		rootConfigPath,
		advancedConfig,
		setAdvancedConfig,
		isInitializing,
		error,
		canProceed,
		next,
		back,
		initialize,
		toggleMcpClient: (client: McpClient) =>
			setSelectedMcpClients((items) =>
				items.includes(client) ? items.filter((item) => item !== client) : [...items, client],
			),
		toggleAgentFile: (file: AgentFile) =>
			setSelectedAgentFiles((items) =>
				items.includes(file) ? items.filter((item) => item !== file) : [...items, file],
			),
	};
}
