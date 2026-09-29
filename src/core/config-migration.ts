import { DEFAULT_INIT_CONFIG, DEFAULT_MIGRATION_CONFIG, DEFAULT_STATUSES } from "../constants/index.ts";
import type { BacklogConfig } from "../types/index.ts";

/**
 * Migrates config to ensure all required fields exist with default values
 */
export function migrateConfig(config: Partial<BacklogConfig>): BacklogConfig {
	const defaultConfig: BacklogConfig = {
		projectName: DEFAULT_MIGRATION_CONFIG.projectName,
		defaultEditor: DEFAULT_MIGRATION_CONFIG.defaultEditor,
		defaultStatus: DEFAULT_MIGRATION_CONFIG.defaultStatus,
		statuses: [...DEFAULT_STATUSES],
		labels: [...DEFAULT_MIGRATION_CONFIG.labels],
		dateFormat: DEFAULT_MIGRATION_CONFIG.dateFormat,
		maxColumnWidth: DEFAULT_MIGRATION_CONFIG.maxColumnWidth,
		autoOpenBrowser: DEFAULT_INIT_CONFIG.autoOpenBrowser,
		defaultPort: DEFAULT_INIT_CONFIG.defaultPort,
		remoteOperations: DEFAULT_INIT_CONFIG.remoteOperations,
		autoCommit: DEFAULT_INIT_CONFIG.autoCommit,
		bypassGitHooks: DEFAULT_INIT_CONFIG.bypassGitHooks,
		checkActiveBranches: DEFAULT_INIT_CONFIG.checkActiveBranches,
		activeBranchDays: DEFAULT_INIT_CONFIG.activeBranchDays,
	};

	// Merge provided config with defaults, ensuring all fields exist
	// Only include fields from config that are not undefined
	const filteredConfig = Object.fromEntries(Object.entries(config).filter(([_, value]) => value !== undefined));

	const migratedConfig: BacklogConfig = {
		...defaultConfig,
		...filteredConfig,
	};

	// Ensure arrays are not undefined
	migratedConfig.statuses = config.statuses || defaultConfig.statuses;
	migratedConfig.labels = config.labels || defaultConfig.labels;

	return migratedConfig;
}

/**
 * Checks if config needs migration (missing any expected fields)
 */
export function needsMigration(config: Partial<BacklogConfig>): boolean {
	// Check for all expected fields including new ones
	// We need to check not just presence but also that they aren't undefined
	const expectedFieldsWithDefaults = [
		{ field: "projectName", hasDefault: true },
		{ field: "statuses", hasDefault: true },
		{ field: "defaultPort", hasDefault: true },
		{ field: "autoOpenBrowser", hasDefault: true },
		{ field: "remoteOperations", hasDefault: true },
		{ field: "autoCommit", hasDefault: true },
	];

	return expectedFieldsWithDefaults.some(({ field }) => {
		const value = config[field as keyof BacklogConfig];
		return value === undefined;
	});
}
