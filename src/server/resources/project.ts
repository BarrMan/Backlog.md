import { t } from "elysia";
import { DEFAULT_STATUSES } from "../../constants/index.ts";
import { Core } from "../../core/backlog.ts";
import { initializeProject } from "../../core/init.ts";
import { getTaskStatistics } from "../../core/statistics.ts";
import type { BacklogConfig } from "../../types/index.ts";
import { getTaskPrefixError } from "../../utils/prefix-config.ts";
import { getVersion } from "../../utils/version.ts";
import { type ResourceDependencies, scopedResource } from "./api.ts";
import { errorSchema, taskSchema } from "./schemas.ts";

const configSchema = t.Object(
	{
		projectName: t.String(),
		statuses: t.Array(t.String()),
		labels: t.Array(t.String()),
		dateFormat: t.String(),
		defaultAssignee: t.Optional(t.Array(t.String())),
		defaultReporter: t.Optional(t.String()),
		types: t.Optional(t.Array(t.String())),
		priorities: t.Optional(t.Array(t.String())),
		projects: t.Optional(t.Array(t.String())),
		milestones: t.Optional(t.Array(t.String())),
		definitionOfDone: t.Optional(t.Array(t.String())),
		defaultStatus: t.Optional(t.String()),
		maxColumnWidth: t.Optional(t.Number()),
		taskResolutionStrategy: t.Optional(t.Union([t.Literal("most_recent"), t.Literal("most_progressed")])),
		defaultEditor: t.Optional(t.String()),
		autoOpenBrowser: t.Optional(t.Boolean()),
		defaultPort: t.Optional(t.Number({ minimum: 1, maximum: 65535 })),
		hideEmptyColumns: t.Optional(t.Boolean()),
		remoteOperations: t.Optional(t.Boolean()),
		autoCommit: t.Optional(t.Boolean()),
		filesystemOnly: t.Optional(t.Boolean()),
		zeroPaddedIds: t.Optional(t.Number()),
		includeDateTimeInDates: t.Optional(t.Boolean()),
		bypassGitHooks: t.Optional(t.Boolean()),
		checkActiveBranches: t.Optional(t.Boolean()),
		activeBranchDays: t.Optional(t.Number()),
		backlogDirectory: t.Optional(t.String()),
		onStatusChange: t.Optional(t.String()),
		prefixes: t.Optional(t.Record(t.String(), t.String())),
		mcp: t.Optional(t.Any()),
	},
	{ additionalProperties: true },
);
const initBody = t.Object(
	{
		projectName: t.String(),
		backlogDirectory: t.Optional(t.String()),
		backlogDirectorySource: t.Optional(t.Union([t.Literal("backlog"), t.Literal(".backlog"), t.Literal("custom")])),
		configLocation: t.Optional(t.Union([t.Literal("folder"), t.Literal("root")])),
		integrationMode: t.Optional(t.Union([t.Literal("mcp"), t.Literal("cli"), t.Literal("none")])),
		mcpClients: t.Optional(
			t.Array(
				t.Union([t.Literal("claude"), t.Literal("codex"), t.Literal("gemini"), t.Literal("kiro"), t.Literal("guide")]),
			),
		),
		agentInstructions: t.Optional(
			t.Array(
				t.Union([
					t.Literal("AGENTS.md"),
					t.Literal("CLAUDE.md"),
					t.Literal("GEMINI.md"),
					t.Literal(".github/copilot-instructions.md"),
					t.Literal("README.md"),
				]),
			),
		),
		installClaudeAgent: t.Optional(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")])),
		filesystemOnly: t.Optional(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")])),
		advancedConfig: t.Optional(t.Record(t.String(), t.Any())),
	},
	{ additionalProperties: true },
);
const statusSchema = t.Object({
	projectScope: t.String(),
	initialized: t.Boolean(),
	projectPath: t.String(),
	backlogDirectory: t.Union([t.String(), t.Null()]),
	backlogDirectorySource: t.Union([t.String(), t.Null()]),
	configLocation: t.Union([t.String(), t.Null()]),
	rootConfigPath: t.Union([t.String(), t.Null()]),
});
const statisticsSchema = t.Object({
	statusCounts: t.Record(t.String(), t.Number()),
	priorityCounts: t.Record(t.String(), t.Number()),
	noPriorityCount: t.Number(),
	totalTasks: t.Number(),
	completedTasks: t.Number(),
	completionPercentage: t.Number(),
	draftCount: t.Number(),
	recentActivity: t.Object({ created: t.Array(taskSchema), updated: t.Array(taskSchema) }),
	projectHealth: t.Object({
		averageTaskAge: t.Number(),
		staleTasks: t.Array(taskSchema),
		blockedTasks: t.Array(taskSchema),
	}),
});
const bool = (value: unknown) =>
	typeof value === "boolean"
		? value
		: typeof value === "string" && value.trim().toLowerCase() === "true"
			? true
			: typeof value === "string" && value.trim().toLowerCase() === "false"
				? false
				: undefined;
export function projectResource({ services }: ResourceDependencies) {
	const app = scopedResource(services, "project");
	app.get(
		"/api/config",
		async ({ core, set }) => {
			try {
				const value = await core.filesystem.loadConfig();
				if (value) return value;
				set.status = 404;
				return { error: "Configuration not found" };
			} catch (error) {
				console.error("Error loading config:", error);
				set.status = 500;
				return { error: "Failed to load configuration" };
			}
		},
		{ response: { 200: configSchema, 404: errorSchema, 500: errorSchema } },
	);
	app.put(
		"/api/config",
		async ({ body, core, set }) => {
			try {
				if (!body.projectName.trim()) {
					set.status = 400;
					return { error: "Project name is required" };
				}
				await core.filesystem.saveConfig(body as BacklogConfig);
				await services.configChanged();
				set.headers["X-Backlog-Project-Scope"] = services.createRequestScope().scope.token;
				return body;
			} catch (error) {
				console.error("Error updating config:", error);
				set.status = 500;
				return { error: "Failed to update configuration" };
			}
		},
		{ body: configSchema, response: { 200: configSchema, 400: errorSchema, 500: errorSchema } },
	);
	app.get(
		"/api/statistics",
		async ({ core, set }) => {
			try {
				const [corpus, drafts] = await Promise.all([core.loadTaskSnapshot(), core.filesystem.listDrafts()]);
				const values = getTaskStatistics(
					corpus.identityIndex.getTasks(true),
					drafts,
					(corpus.config?.statuses || DEFAULT_STATUSES) as string[],
					corpus.config?.priorities ?? [],
				);
				return {
					...values,
					statusCounts: Object.fromEntries(values.statusCounts),
					priorityCounts: Object.fromEntries(values.priorityCounts),
				};
			} catch (error) {
				console.error("Error getting statistics:", error);
				set.status = 500;
				return { error: "Failed to get statistics" };
			}
		},
		{ response: { 200: statisticsSchema, 500: errorSchema } },
	);
	app.get(
		"/api/status",
		async ({ core, scope }) => {
			try {
				const config = await core.filesystem.loadConfig();
				const resolution = core.filesystem.resolveBacklogDirectoryInfo();
				return {
					projectScope: scope.token,
					initialized: !!config,
					projectPath: core.filesystem.rootDir,
					backlogDirectory: scope.directory,
					backlogDirectorySource: resolution.source,
					configLocation: resolution.configSource,
					rootConfigPath: resolution.rootConfigPath,
				};
			} catch {
				return {
					projectScope: scope.token,
					initialized: false,
					projectPath: core.filesystem.rootDir,
					backlogDirectory: null,
					backlogDirectorySource: null,
					configLocation: null,
					rootConfigPath: null,
				};
			}
		},
		{ response: statusSchema },
	);
	app.get(
		"/api/version",
		async ({ set }) => {
			try {
				return { version: await getVersion() };
			} catch {
				set.status = 500;
				return { error: "Failed to get version" };
			}
		},
		{ response: { 200: t.Object({ version: t.String() }), 500: errorSchema } },
	);
	app.post(
		"/api/init",
		async ({ body, core, set }) => {
			try {
				const projectName = body.projectName.trim();
				if (!projectName) {
					set.status = 400;
					return { error: "Project name is required" };
				}
				const advancedConfig = body.advancedConfig as { taskPrefix?: unknown } | undefined;
				const prefixError = getTaskPrefixError(
					typeof advancedConfig?.taskPrefix === "string" ? advancedConfig.taskPrefix : "",
				);
				if (prefixError) {
					set.status = 400;
					return { error: prefixError };
				}
				if (await core.filesystem.loadConfig()) {
					set.status = 400;
					return { error: "Project is already initialized" };
				}
				const initializationCore = new Core(core.filesystem.rootDir);
				const result = await initializeProject(initializationCore, {
					projectName,
					backlogDirectory: typeof body.backlogDirectory === "string" ? body.backlogDirectory.trim() : undefined,
					backlogDirectorySource: ["backlog", ".backlog", "custom"].includes(String(body.backlogDirectorySource))
						? (body.backlogDirectorySource as "backlog" | ".backlog" | "custom")
						: undefined,
					configLocation: ["folder", "root"].includes(String(body.configLocation))
						? (body.configLocation as "folder" | "root")
						: undefined,
					integrationMode: (body.integrationMode as "mcp" | "cli" | "none") || "none",
					mcpClients: Array.isArray(body.mcpClients) ? body.mcpClients : [],
					agentInstructions: Array.isArray(body.agentInstructions) ? body.agentInstructions : [],
					installClaudeAgent: bool(body.installClaudeAgent) ?? false,
					filesystemOnly: bool(body.filesystemOnly) ?? false,
					advancedConfig: body.advancedConfig || {},
					existingConfig: null,
				});
				await services.configChanged();
				const projectScope = services.createRequestScope().scope.token;
				return {
					success: result.success,
					projectName: result.projectName,
					mcpResults: result.mcpResults,
					projectScope,
				};
			} catch (error) {
				console.error("Error initializing project:", error);
				set.status = 500;
				return { error: error instanceof Error ? error.message : "Failed to initialize project" };
			}
		},
		{
			body: initBody,
			response: {
				200: t.Object({
					success: t.Boolean(),
					projectName: t.String(),
					mcpResults: t.Optional(t.Record(t.String(), t.String())),
					projectScope: t.String(),
				}),
				400: errorSchema,
				500: errorSchema,
			},
		},
	);
	return app;
}
