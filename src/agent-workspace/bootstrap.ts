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
		`You are the agent for Backlog task ${input.taskId}.`,
		`Session: ${input.sessionId}`,
		`Project: ${input.projectRoot}`,
		`Working directory: ${input.cwd}`,
		`Configuration scope: ${input.configScope}${input.worktree ? " (worktree)" : ""}`,
		"",
		`Begin by reading \`backlog task view ${input.taskId} --plain\`. Its description is the durable working context. Continue from the recorded state, following the user's latest instructions.`,
		"Keep the description current after each meaningful update: direction, decisions, completed work, verification, blockers, and the next concrete step. Record enough for a fresh session to continue without this conversation.",
		"Preserve requirements and useful context. Keep it concise and current, not a conversation log. Distinguish verified results from assumptions and unfinished work.",
		"Use the Backlog CLI for task updates; consult command --help as needed. Before switching sessions, save any outstanding context to the description. No separate handover document is needed.",
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
