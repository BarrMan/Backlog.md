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
		`You are working on Backlog task ${input.taskId} in ${input.cwd}.`,
		`Session ${input.sessionId}; project root ${input.projectRoot}; config ${input.configScope}${input.worktree ? " worktree" : ""}.`,
		`Read context first: \`BACKLOG_CWD=${input.projectRoot} backlog task view ${input.taskId} --plain\`.`,
		`Update task state only with the Backlog CLI, usually \`BACKLOG_CWD=${input.projectRoot} backlog task edit ${input.taskId} ...\`; never edit files under backlog/ directly.`,
		"Keep task updates concise: decisions, completed work, verification, blockers, and next step; distinguish verified facts from assumptions.",
		`Optional prior sessions, if this CLI supports it: \`BACKLOG_CWD=${input.projectRoot} backlog agent-session list ${input.taskId}\`. If unavailable, ignore and continue from the task.`,
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
