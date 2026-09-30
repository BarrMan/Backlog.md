import { Elysia, t } from "elysia";
import { DEFAULT_STATUSES } from "../../constants/index.ts";
import { initializeProject } from "../../core/init.ts";
import { getTaskStatistics } from "../../core/statistics.ts";
import type { BacklogConfig } from "../../types/index.ts";
import { getVersion } from "../../utils/version.ts";
import { parseInitInput } from "../validation.ts";
import type { ResourceDependencies } from "./api.ts";

const objectBody = t.Object(
	{
		projectName: t.Optional(t.Any()),
		defaultPort: t.Optional(t.Any()),
		backlogDirectory: t.Optional(t.Any()),
		backlogDirectorySource: t.Optional(t.Any()),
		configLocation: t.Optional(t.Any()),
		integrationMode: t.Optional(t.Any()),
		mcpClients: t.Optional(t.Any()),
		agentInstructions: t.Optional(t.Any()),
		installClaudeAgent: t.Optional(t.Any()),
		filesystemOnly: t.Optional(t.Any()),
		advancedConfig: t.Optional(t.Any()),
	},
	{ additionalProperties: true },
);
const bool = (value: unknown) =>
	typeof value === "boolean"
		? value
		: typeof value === "string" && value.trim().toLowerCase() === "true"
			? true
			: typeof value === "string" && value.trim().toLowerCase() === "false"
				? false
				: undefined;
export function projectResource({ core, services }: ResourceDependencies): Elysia {
	const app = new Elysia({ name: "project" });
	app.get("/api/config", async () => {
		try {
			const value = await core.filesystem.loadConfig();
			return value ? Response.json(value) : Response.json({ error: "Configuration not found" }, { status: 404 });
		} catch (error) {
			console.error("Error loading config:", error);
			return Response.json({ error: "Failed to load configuration" }, { status: 500 });
		}
	});
	app.put(
		"/api/config",
		async ({ body }) => {
			try {
				if (typeof body.projectName !== "string" || !body.projectName.trim())
					return Response.json({ error: "Project name is required" }, { status: 400 });
				if (body.defaultPort && (body.defaultPort < 1 || body.defaultPort > 65535))
					return Response.json({ error: "Port must be between 1 and 65535" }, { status: 400 });
				await core.filesystem.saveConfig(body as BacklogConfig);
				services.configChanged(body.projectName);
				return Response.json(body);
			} catch (error) {
				console.error("Error updating config:", error);
				return Response.json({ error: "Failed to update configuration" }, { status: 500 });
			}
		},
		{ body: objectBody },
	);
	app.get("/api/statistics", async () => {
		try {
			const ready = services.wasReady();
			const store = await services.store();
			const config = await core.filesystem.loadConfig();
			await store.ensureConfigWatcher();
			if (ready) await core.refreshTasksForTaskRead();
			const corpus = store.getTaskCorpusSnapshot();
			const values = getTaskStatistics(
				corpus.identityIndex?.getTasks(true) ?? [...corpus.activeTasks, ...corpus.completedTasks],
				await core.filesystem.listDrafts(),
				(corpus.config?.statuses || DEFAULT_STATUSES) as string[],
				config?.priorities ?? corpus.config?.priorities ?? [],
			);
			return Response.json({
				...values,
				statusCounts: Object.fromEntries(values.statusCounts),
				priorityCounts: Object.fromEntries(values.priorityCounts),
			});
		} catch (error) {
			console.error("Error getting statistics:", error);
			return Response.json({ error: "Failed to get statistics" }, { status: 500 });
		}
	});
	app.get("/api/status", async () => {
		try {
			const config = await core.filesystem.loadConfig();
			const resolution = core.filesystem.resolveBacklogDirectoryInfo();
			return Response.json({
				initialized: !!config,
				projectPath: core.filesystem.rootDir,
				backlogDirectory: resolution.backlogDir,
				backlogDirectorySource: resolution.source,
				configLocation: resolution.configSource,
				rootConfigPath: resolution.rootConfigPath,
			});
		} catch {
			return Response.json({
				initialized: false,
				projectPath: core.filesystem.rootDir,
				backlogDirectory: null,
				backlogDirectorySource: null,
				configLocation: null,
				rootConfigPath: null,
			});
		}
	});
	app.get("/api/version", async () => {
		try {
			return Response.json({ version: await getVersion() });
		} catch {
			return Response.json({ error: "Failed to get version" }, { status: 500 });
		}
	});
	app.post(
		"/api/init",
		async ({ body: input }) => {
			try {
				const parsed = parseInitInput(input);
				if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
				if (await core.filesystem.loadConfig())
					return Response.json({ error: "Project is already initialized" }, { status: 400 });
				const body = parsed.value;
				const result = await initializeProject(core, {
					projectName: body.projectName,
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
				services.configChanged(result.projectName);
				return Response.json({
					success: result.success,
					projectName: result.projectName,
					mcpResults: result.mcpResults,
				});
			} catch (error) {
				console.error("Error initializing project:", error);
				return Response.json(
					{ error: error instanceof Error ? error.message : "Failed to initialize project" },
					{ status: 500 },
				);
			}
		},
		{ body: objectBody },
	);
	return app;
}
