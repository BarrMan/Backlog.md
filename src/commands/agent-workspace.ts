import type { Command } from "commander";
import {
	initializeAgentConfiguration,
	loadAgentConfiguration,
	resolveAgentConfiguration,
	updateAgentConfiguration,
} from "../agent-workspace/config.ts";
import { AgentSessionService } from "../agent-workspace/sessions.ts";
import { isTmuxWorkspace, TmuxWorkspace, type TmuxWorkspaceView } from "../agent-workspace/tmux-workspace.ts";
import type { AgentConfigScope, AgentConfiguration, AgentPreset } from "../agent-workspace/types.ts";
import type { Core } from "../core/backlog.ts";
import { UnifiedViewController } from "../ui/unified/controller.ts";
import { AgentWorkspaceController, type AgentWorkspaceOptions } from "../ui/workspace/controller.ts";
import { createWorkspaceViewState } from "../ui/workspace/state.ts";
import { addHelpSchema, choiceType } from "./help-schema.ts";

const SCOPES = ["root", "project", "card"] as const;
const BOOTSTRAPS = ["opencode", "claude", "codex", "gemini", "antigravity", "prompt"] as const;

function parseScope(value: string): AgentConfigScope {
	if ((SCOPES as readonly string[]).includes(value)) return value as AgentConfigScope;
	throw new Error(`Invalid configuration scope: ${value}. Valid scopes: ${SCOPES.join(", ")}`);
}

function parseEnv(values: string[] = []): Record<string, string> {
	const entries = values.map((value) => {
		const separator = value.indexOf("=");
		if (separator <= 0) throw new Error(`Invalid environment value: ${value}. Use NAME=value.`);
		return [value.slice(0, separator), value.slice(separator + 1)] as const;
	});
	return Object.fromEntries(entries);
}

function parseBoolean(value: string): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new Error("--worktree must be true or false.");
}

function print(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function taskIdForScope(scope: AgentConfigScope, taskId: string | undefined): string | undefined {
	if (scope === "card" && !taskId) throw new Error("--task is required for card configuration.");
	return taskId;
}

type PresetOptions = {
	preset?: string;
	command?: string;
	env?: string[];
	clearEnv?: boolean;
	prepare?: string;
	worktree?: string;
	bootstrap?: string;
};

function applyPresetOptions(
	configuration: AgentConfiguration,
	presetName: string,
	options: PresetOptions,
): AgentConfiguration {
	if (options.clearEnv && options.env?.length) throw new Error("Cannot combine --env with --clear-env.");
	const current = configuration.presets[presetName];
	if (!current) throw new Error(`Agent preset not found: ${presetName}. Use agent-config create to add it.`);
	if (options.bootstrap && !(BOOTSTRAPS as readonly string[]).includes(options.bootstrap)) {
		throw new Error(`Invalid bootstrap: ${options.bootstrap}. Valid values: ${BOOTSTRAPS.join(", ")}`);
	}
	const preset: AgentPreset = {
		...current,
		...(options.command !== undefined && { command: options.command }),
		...(options.env && { env: parseEnv(options.env) }),
		...(options.clearEnv && { env: {} }),
		...(options.prepare !== undefined && { prepare: options.prepare }),
		...(options.worktree !== undefined && { worktree: parseBoolean(options.worktree) }),
		...(options.bootstrap && { bootstrap: options.bootstrap as AgentPreset["bootstrap"] }),
	};
	return { ...configuration, selectedPreset: presetName, presets: { ...configuration.presets, [presetName]: preset } };
}

type CoreFactory = {
	project(): Promise<Core>;
	root(): Promise<Core>;
};

function parseWorkspaceView(value: string): TmuxWorkspaceView {
	if (
		value === "board" ||
		value === "workspace-nav" ||
		value === "workspace-tasks" ||
		value === "workspace-details" ||
		value === "workspace-footer"
	)
		return value;
	throw new Error("workspace-ui view must be a native workspace region.");
}

export function registerAgentWorkspaceCommands(program: Command, getCore: CoreFactory): void {
	const coreForScope = (scope: AgentConfigScope) => (scope === "root" ? getCore.root() : getCore.project());
	addHelpSchema(program.command("workspace"), {
		reads: "Agent session state and configuration",
		output: "Native tmux Board and Workspace windows",
		examples: ["backlog workspace"],
	})
		.description("open the task-centered agent workspace")
		.action(async () => {
			const core = await getCore.project();
			await new TmuxWorkspace(core.filesystem.rootDir).enter("workspace");
		});

	program.command("workspace-ui <view>", { hidden: true }).action(async (value) => {
		const view = parseWorkspaceView(value);
		if (!isTmuxWorkspace()) throw new Error("workspace-ui can only run inside a Backlog tmux workspace.");
		if (process.env.BACKLOG_TMUX_VIEW !== view) throw new Error("workspace-ui view does not match its tmux host.");

		const core = await getCore.project();
		const host = new TmuxWorkspace(core.filesystem.rootDir);
		if (process.env.BACKLOG_TMUX_WORKSPACE !== host.sessionName)
			throw new Error("workspace-ui belongs to a different Backlog tmux workspace.");
		if (view === "board") {
			await new UnifiedViewController({ core, initialView: "kanban" }).run();
			return;
		}
		if (view === "workspace-nav" || view === "workspace-details" || view === "workspace-footer") {
			await new AgentWorkspaceController(core, {
				host,
				state: createWorkspaceViewState(),
				region: view as AgentWorkspaceOptions["region"],
			}).run();
			return;
		}

		const state = createWorkspaceViewState();
		await new AgentWorkspaceController(core, { host, state, region: "workspace-tasks" }).run();
	});

	const sessions = addHelpSchema(program.command("agent-session"), {
		reads: "Task session state and saved output",
		optional: [{ name: "--help", type: "Boolean", description: "Show lifecycle command help" }],
		output: "Session records as JSON; output prints persisted session output; attach connects to the session terminal",
		examples: ["backlog agent-session list BACK-123", "backlog agent-session start BACK-123 --preset opencode"],
	})
		.description("manage task agent sessions")
		.showHelpAfterError();

	sessions
		.command("list <taskId>")
		.description("list current and prior sessions for a task")
		.action(async (taskId) => {
			print(await new AgentSessionService(await getCore.project()).list(taskId));
		});
	sessions
		.command("start <taskId>")
		.description("start a task session")
		.option("--preset <name>", "configured preset name")
		.option("--predecessor <sessionId>", "session this one replaces")
		.action(async (taskId, options) => {
			print(
				await new AgentSessionService(await getCore.project()).start(taskId, {
					preset: options.preset,
					predecessorId: options.predecessor,
				}),
			);
		});
	sessions
		.command("stop <taskId>")
		.description("stop the active or selected session")
		.option("--session <sessionId>", "session ID")
		.action(async (taskId, options) => {
			await new AgentSessionService(await getCore.project()).stop(taskId, options.session);
		});
	sessions
		.command("attach <taskId>")
		.description("attach this terminal to a session")
		.option("--session <sessionId>", "session ID")
		.action(async (taskId, options) => {
			await new AgentSessionService(await getCore.project()).attach(taskId, options.session);
		});
	sessions
		.command("output <taskId>")
		.description("print persisted session output")
		.option("--session <sessionId>", "session ID")
		.action(async (taskId, options) => {
			console.log(await new AgentSessionService(await getCore.project()).output(taskId, options.session));
		});
	sessions
		.command("handoff <taskId>")
		.description(
			"replace the active session using the task description; stop the previous session after successful startup",
		)
		.action(async (taskId) => print(await new AgentSessionService(await getCore.project()).requestHandoff(taskId)));
	sessions
		.command("handoff-continue <taskId>")
		.description("retry a pending or failed session replacement")
		.option("--worker", "run as a detached continuation worker")
		.action(async (taskId, options) => {
			if (options.worker) await Bun.sleep(250);
			print(await new AgentSessionService(await getCore.project()).continueHandoff(taskId));
		});
	sessions
		.command("recover <taskId>")
		.description("recover task session state")
		.action(async (taskId) => {
			await new AgentSessionService(await getCore.project()).recover(taskId);
		});
	sessions
		.command("reset <taskId>")
		.description("reset persisted task session state")
		.action(async (taskId) => {
			await new AgentSessionService(await getCore.project()).reset(taskId);
		});

	const config = addHelpSchema(program.command("agent-config"), {
		reads: "Scoped agent workspace configuration",
		writes: "A selected preset in a complete scoped configuration",
		optional: [
			{ name: "--task", type: "Task ID", description: "Required for card scope" },
			{ name: "--preset", type: "String", description: "Selected preset name" },
			{ name: "--command", type: "String", description: "Agent command" },
			{ name: "--env", type: "NAME=value", description: "Replace selected preset environment; repeatable" },
			{ name: "--clear-env", type: "Boolean", description: "Clear selected preset environment" },
			{ name: "--prepare", type: "String", description: "Preparation command" },
			{ name: "--worktree", type: "true|false", description: "Create a task worktree" },
			{ name: "--bootstrap", type: choiceType(BOOTSTRAPS), description: "How the initial prompt is delivered" },
		],
		output: "Resolved or scoped configuration as JSON",
		examples: [
			"backlog agent-config show",
			"backlog agent-config init project",
			"backlog agent-config create card --task BACK-123 --preset custom --command 'agent {prompt}'",
			"backlog agent-config set card --task BACK-123 --preset custom --worktree true",
		],
	})
		.description("inspect and selectively edit scoped agent configuration")
		.showHelpAfterError();
	config
		.command("show [scope]")
		.description("show resolved or exact scoped configuration")
		.option("--task <taskId>", "task ID for card scope")
		.action(async (scope, options) => {
			if (!scope)
				return print(
					await resolveAgentConfiguration(await (options.task ? getCore.project() : getCore.root()), options.task),
				);
			const parsed = parseScope(scope);
			print(await loadAgentConfiguration(await coreForScope(parsed), parsed, taskIdForScope(parsed, options.task)));
		});
	config
		.command("init <scope>")
		.description("copy the immediate parent configuration into an empty scope")
		.option("--task <taskId>", "task ID for card scope")
		.action(async (scope, options) => {
			const parsed = parseScope(scope);
			print(
				await initializeAgentConfiguration(await coreForScope(parsed), parsed, taskIdForScope(parsed, options.task)),
			);
		});
	const presetOptions = (command: Command, includePreset = true) => {
		if (includePreset) command.option("--preset <name>", "preset to select or edit");
		return command
			.option("--command <command>", "agent command")
			.option("--env <NAME=value>", "replace environment; repeatable", (value, previous: string[] = []) => [
				...previous,
				value,
			])
			.option("--clear-env", "clear environment")
			.option("--prepare <command>", "preparation command")
			.option("--worktree <true|false>", "whether this preset creates a worktree")
			.option("--bootstrap <kind>", `one of: ${BOOTSTRAPS.join(", ")}`)
			.option("--task <taskId>", "task ID for card scope");
	};
	presetOptions(config.command("set <scope>").description("select or selectively update one preset")).action(
		async (scope, options: PresetOptions & { task?: string }) => {
			const parsed = parseScope(scope);
			const taskId = taskIdForScope(parsed, options.task);
			const core = await coreForScope(parsed);
			const next = await updateAgentConfiguration(
				core,
				parsed,
				(editable) => applyPresetOptions(editable, options.preset ?? editable.selectedPreset, options),
				taskId,
			);
			print(next);
		},
	);
	presetOptions(
		config.command("create <scope>").description("add a custom preset without removing existing presets"),
		false,
	)
		.requiredOption("--preset <name>", "new preset name")
		.action(async (scope, options: PresetOptions & { task?: string }) => {
			if (options.command === undefined) throw new Error("--command is required when creating a custom preset.");
			const parsed = parseScope(scope);
			const taskId = taskIdForScope(parsed, options.task);
			const core = await coreForScope(parsed);
			const preset = options.preset as string;
			const next = await updateAgentConfiguration(
				core,
				parsed,
				(editable) => {
					if (Object.hasOwn(editable.presets, preset))
						throw new Error(`Agent preset already exists: ${preset}. Use agent-config set to edit it.`);
					const base = editable.presets[editable.selectedPreset];
					if (!base) throw new Error(`Selected preset is missing: ${editable.selectedPreset}`);
					return applyPresetOptions(
						{
							...editable,
							presets: {
								...editable.presets,
								[preset]: { ...base, command: options.command as string, bootstrap: "prompt" },
							},
						},
						preset,
						options,
					);
				},
				taskId,
			);
			print(next);
		});
}
