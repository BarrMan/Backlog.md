import { stdin as input } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { collectArchivedMilestoneKeys, milestoneKey } from "../core/milestones.ts";
import { type Core, exportKanbanBoardToFile, updateReadmeWithBoard } from "../index.ts";
import { createLoadingScreen } from "../ui/loading.ts";
import { resolveMilestoneInputForStorage } from "../utils/milestone-storage.ts";
import { AmbiguousTaskIdError } from "../utils/task-path.ts";

type ProjectViewCommandRuntime = {
	createCore(): Promise<Core>;
	requireProjectRoot(): Promise<string>;
	hasInteractiveTTY: boolean;
	version: string;
	reportFailure(summary: string, error: unknown): void;
};
type BrowserServerLifecycle = { stop(): Promise<void> };

function assertBoardExportIdentities(snapshot: Awaited<ReturnType<Core["loadTaskSnapshot"]>>): void {
	for (const taskId of snapshot.identityIndex.getContestedIds()) {
		const resolution = snapshot.identityIndex.resolveForRead(taskId);
		if (resolution.status === "ambiguous") {
			console.error("Board export blocked by duplicate task ID.");
			throw new AmbiguousTaskIdError(taskId, resolution.candidates);
		}
	}
}

async function resolveBrowserPort(
	requestedPort: string | undefined,
	defaultPort: number,
	nonInteractive: boolean | undefined,
	isPortAvailable: (port: number) => Promise<boolean>,
	findNextAvailablePort: (port: number) => Promise<number | null>,
	hasInteractiveTTY: boolean,
): Promise<number | null> {
	const port = Number.parseInt(requestedPort || defaultPort.toString(), 10);
	if (Number.isNaN(port) || port < 1 || port > 65535) {
		console.error("Invalid port number. Must be between 1 and 65535.");
		process.exit(1);
	}
	if (await isPortAvailable(port)) return port;
	const nextPort = await findNextAvailablePort(port + 1);
	if (nextPort === null) {
		console.error(`No available port found after ${port}. Use --port to specify an available port.`);
		process.exit(1);
	}
	if (nonInteractive || !hasInteractiveTTY) {
		console.log(`⚠️  Port ${port} is already in use. Using port ${nextPort} instead.`);
		return nextPort;
	}
	const rl = createInterface({ input, output: process.stdout });
	const answer = (
		await rl.question(
			`\n⚠️  Port ${port} is already in use.\n💡 Port ${nextPort} is available. Start on port ${nextPort}? [Y/n] `,
		)
	)
		.trim()
		.toLowerCase();
	rl.close();
	if (answer === "" || answer === "y") return nextPort;
	console.log("Aborted.");
	process.exit(0);
}

function registerBrowserLifecycle(server: BrowserServerLifecycle): void {
	let shuttingDown = false;
	const shutdown = async (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`\nReceived ${signal}. Shutting down server...`);
		try {
			await Promise.race([server.stop(), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
		} finally {
			process.exit(0);
		}
	};
	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
	process.once("SIGQUIT", () => void shutdown("SIGQUIT"));
}

export function registerBoardCommands(program: Command, runtime: ProjectViewCommandRuntime): void {
	const boardCmd = program.command("board");
	const addBoardOptions = (cmd: Command) =>
		cmd
			.option("-l, --layout <layout>", "board layout (horizontal|vertical)", "horizontal")
			.option("--vertical", "use vertical layout (shortcut for --layout vertical)")
			.option("-m, --milestones", "group tasks by milestone");
	const view = async (options: { milestones?: boolean }) => {
		const core = await runtime.createCore();
		const config = await core.filesystem.loadConfig();
		const { UnifiedViewController } = await import("../ui/unified/controller.ts");
		await new UnifiedViewController({
			core,
			initialView: "kanban",
			milestoneMode: options.milestones,
			tasksLoader: async (updateProgress) => {
				const [tasks, milestones, archived] = await Promise.all([
					core.loadTasks(updateProgress),
					core.filesystem.listMilestones(),
					core.filesystem.listArchivedMilestones(),
				]);
				const archivedKeys = new Set(collectArchivedMilestoneKeys(archived, milestones));
				return {
					tasks: archivedKeys.size
						? tasks.map((task) => {
								const key = milestoneKey(resolveMilestoneInputForStorage(task.milestone ?? "", milestones, archived));
								return key && archivedKeys.has(key)
									? { ...task, milestone: undefined, status: task.status || "" }
									: { ...task, status: task.status || "" };
							})
						: tasks.map((task) => ({ ...task, status: task.status || "" })),
					statuses: config?.statuses || [],
				};
			},
		}).run();
	};
	addBoardOptions(boardCmd).description("display tasks in a Kanban board").action(view);
	addBoardOptions(boardCmd.command("view").description("display tasks in a Kanban board")).action(view);
	boardCmd
		.command("export [filename]")
		.description("export kanban board to markdown file")
		.option("--force", "overwrite existing file without confirmation")
		.option("--readme", "export to README.md with markers")
		.option("--export-version <version>", "version to include in the export")
		.action(async (filename, options) => {
			const core = await runtime.createCore();
			const loadingScreen = await createLoadingScreen("Loading tasks for export");
			try {
				const snapshot = await core.loadTaskSnapshot();
				assertBoardExportIdentities(snapshot);
				const tasks = snapshot.tasks;
				const config = snapshot.config;
				loadingScreen?.update(`Total tasks: ${tasks.length}`);
				loadingScreen?.close();
				const cwd = await runtime.requireProjectRoot();
				const projectName = config?.projectName || (await import("node:path")).basename(cwd);
				if (options.readme) {
					await updateReadmeWithBoard(
						tasks,
						config?.statuses || [],
						projectName,
						options.exportVersion || runtime.version,
					);
					console.log("Updated README.md with Kanban board.");
					return;
				}
				const outputPath = (await import("node:path")).join(cwd, filename || "Backlog.md");
				const exists = await Bun.file(outputPath).exists();
				if (exists && !options.force) {
					const rl = createInterface({ input });
					try {
						if (
							!(await rl.question(`File "${outputPath}" already exists. Overwrite? (y/N): `))
								.toLowerCase()
								.startsWith("y")
						) {
							console.log("Export cancelled.");
							return;
						}
					} finally {
						rl.close();
					}
				}
				await exportKanbanBoardToFile(tasks, config?.statuses || [], outputPath, projectName, options.force || !exists);
				console.log(`Exported board to ${outputPath}`);
			} catch (error) {
				loadingScreen?.close();
				throw error;
			}
		});
}

export function registerBrowserOverviewCommands(program: Command, runtime: ProjectViewCommandRuntime): void {
	program
		.command("browser")
		.description("open browser interface on this machine only at 127.0.0.1 (press Ctrl+C or Cmd+C to stop)")
		.option("-p, --port <port>", "port to run server on")
		.option("--no-open", "don't automatically open browser")
		.option("--non-interactive", "automatically use next free port without asking")
		.action(async (options) => {
			try {
				const cwd = await runtime.requireProjectRoot();
				const { BacklogServer, findNextAvailablePort, isPortAvailable } = await import("../server/index.ts");
				const port = await resolveBrowserPort(
					options.port,
					(await (await runtime.createCore()).filesystem.loadConfig())?.defaultPort ?? 6420,
					options.nonInteractive,
					isPortAvailable,
					findNextAvailablePort,
					runtime.hasInteractiveTTY,
				);
				if (port === null) return;
				const server = new BacklogServer(cwd);
				await server.start(port, options.open !== false);
				registerBrowserLifecycle(server);
			} catch (error) {
				runtime.reportFailure("Failed to start browser interface", error);
			}
		});
	program
		.command("overview")
		.description("display project statistics and metrics")
		.action(async () => {
			try {
				const core = await runtime.createCore();
				if (!(await core.filesystem.loadConfig())) return;
				const { runOverviewCommand } = await import("./overview.ts");
				await runOverviewCommand(core);
			} catch (error) {
				runtime.reportFailure("Failed to display project overview", error);
			}
		});
}
