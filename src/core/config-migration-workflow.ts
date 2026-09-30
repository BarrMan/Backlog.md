import type { BacklogConfig, Milestone } from "../types/index.ts";
import { migrateConfig, needsMigration } from "./config-migration.ts";
import { extractLegacyMilestones } from "./legacy-milestone-parser.ts";
import { needsDraftPrefixMigration } from "./prefix-migration.ts";

type ConfigMigrationDependencies = {
	ensureConfigLoaded: () => Promise<void>;
	loadConfig: () => Promise<BacklogConfig | null>;
	readConfigContent: () => Promise<string>;
	listMilestones: () => Promise<Milestone[]>;
	createMilestone: (title: string) => Promise<Milestone>;
	saveConfig: (config: BacklogConfig) => Promise<void>;
	migrateDraftPrefixes: () => Promise<void>;
};

function milestoneKeys(milestone: Milestone): string[] {
	return [milestone.id, milestone.title].map((value) => value.trim().toLowerCase()).filter(Boolean);
}

export async function ensureConfigMigrated(dependencies: ConfigMigrationDependencies): Promise<void> {
	await dependencies.ensureConfigLoaded();
	const legacyMilestones = await dependencies
		.readConfigContent()
		.then(extractLegacyMilestones)
		.catch(() => []);
	let config = await dependencies.loadConfig();
	const needsSchemaMigration = !config || needsMigration(config);
	if (needsSchemaMigration) config = migrateConfig(config || {});
	if (legacyMilestones.length > 0) {
		const existingKeys = new Set((await dependencies.listMilestones()).flatMap(milestoneKeys));
		for (const title of legacyMilestones) {
			const normalized = title.trim();
			if (!normalized || existingKeys.has(normalized.toLowerCase())) continue;
			for (const key of milestoneKeys(await dependencies.createMilestone(normalized))) existingKeys.add(key);
		}
	}
	if (config && (needsSchemaMigration || legacyMilestones.length > 0)) await dependencies.saveConfig(config);
	if (needsDraftPrefixMigration(config)) await dependencies.migrateDraftPrefixes();
}

export function readLegacyConfigContent(configPath: string): Promise<string> {
	return Bun.file(configPath).text();
}
