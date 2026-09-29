import type { AgentPreset } from "./types.ts";

export interface SessionBootstrapInput {
	taskId: string;
	sessionId: string;
	projectRoot: string;
	cwd: string;
	configScope: string;
	worktree: boolean;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function filePrompt(bootstrapPath: string): string {
	return `"$(cat -- ${shellQuote(bootstrapPath)})"`;
}

function appendArguments(command: string, arguments_: string): string {
	if (/[|;&\n]/.test(command)) {
		throw new Error(
			"Built-in agent commands must be an executable with flags, not a shell pipeline or compound command.",
		);
	}
	return `${command} ${arguments_}`;
}

/** Render only enough orientation to let an agent begin safely and load detail on demand. */
export function renderSessionBootstrap(input: SessionBootstrapInput): string {
	return [
		"# Backlog.md agent session",
		`Task: ${input.taskId}`,
		`Session: ${input.sessionId}`,
		`Project: ${input.projectRoot}`,
		`Working directory: ${input.cwd}`,
		`Configuration scope: ${input.configScope}${input.worktree ? " (worktree)" : ""}`,
		"",
		`Read the task card first: \`backlog task view ${input.taskId} --plain\`.`,
		"Before acting, read the handoff referenced for this session, if one exists.",
		"",
		"Capability index (load only what the current work needs):",
		"- Task edits and planning: `backlog instructions task-execution`",
		"- Create or split work: `backlog instructions task-creation`",
		"- Verify and finish work: `backlog instructions task-finalization`",
		"- Sessions, handoffs, configuration, and worktrees: `backlog instructions agent-workspace`",
		"",
		`Use BACKLOG_CWD=${input.projectRoot}; work in ${input.cwd}. Previous sessions: \`backlog agent-session list ${input.taskId}\`.`,
	].join("\n");
}

/**
 * Returns a shell command that supplies the bootstrap as the agent's initial prompt.
 * The shell reads the file at launch time; its contents never become shell source.
 */
export function buildAgentLaunchCommand(preset: AgentPreset, bootstrapPath: string): string {
	const prompt = filePrompt(bootstrapPath);
	switch (preset.bootstrap) {
		case "opencode":
			return appendArguments(preset.command, `--prompt ${prompt}`);
		case "claude":
			return appendArguments(preset.command, prompt);
		case "codex":
			return appendArguments(preset.command, prompt);
		case "gemini":
			return appendArguments(preset.command, `--prompt-interactive ${prompt}`);
		case "antigravity":
			return appendArguments(preset.command, `--prompt-interactive ${prompt}`);
		case "prompt": {
			if (!preset.command.includes("{prompt}") && !preset.command.includes("{instructions}")) {
				throw new Error(
					"Custom agent commands must include {prompt} or {instructions} to receive session instructions.",
				);
			}
			return preset.command.replaceAll("{prompt}", prompt).replaceAll("{instructions}", prompt);
		}
	}
}
