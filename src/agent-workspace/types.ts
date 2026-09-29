/** Complete configurations replace their parent; fields are never inherited. */
export interface AgentPreset {
	command: string;
	env: Record<string, string>;
	prepare: string;
	worktree: boolean;
	/** How startup instructions are delivered to the agent. */
	bootstrap: "opencode" | "claude" | "codex" | "gemini" | "antigravity" | "prompt";
}

export interface AgentConfiguration {
	selectedPreset: string;
	presets: Record<string, AgentPreset>;
}

export type AgentConfigScope = "root" | "project" | "card";

export interface ResolvedAgentConfiguration {
	scope: AgentConfigScope;
	config: AgentConfiguration;
}

export interface AgentSession {
	id: string;
	taskId: string;
	preset: string;
	/** The exact launch configuration, retained so replacements cannot drift with later config edits. */
	presetSnapshot?: AgentPreset;
	configScope: AgentConfigScope;
	tmuxName: string;
	cwd: string;
	createdAt: string;
	endedAt?: string;
	status: "starting" | "running" | "stopped" | "handed-off" | "failed";
	ownerPid?: number;
	predecessorId?: string;
	outputPath: string;
	bootstrapPath: string;
	error?: string;
}

export interface HandoffRequest {
	id: string;
	sessionId: string;
	documentPath: string;
	/** Retained while its file is absent so the next handoff restores the same document identity. */
	document?: {
		id: string;
		title: string;
		type: "readme" | "guide" | "specification" | "other";
		createdDate: string;
		path: string;
		tags?: string[];
	};
	dispatchedAt?: string;
	dispatchOwnerPid?: number;
	replacementOwnerPid?: number;
	status: "requested" | "ready" | "replacing" | "failed" | "completed";
	createdAt: string;
	error?: string;
}

export interface TaskSessions {
	taskId: string;
	activeSessionId?: string;
	worktreePath?: string;
	sessions: AgentSession[];
	handoff?: HandoffRequest;
}
