export const AGENT_BOOTSTRAP_TYPES = ["opencode", "claude", "codex", "gemini", "antigravity", "prompt"] as const;
export type AgentBootstrap = (typeof AGENT_BOOTSTRAP_TYPES)[number];

export const AGENT_CONFIG_SCOPES = ["root", "project", "card"] as const;
export type AgentConfigScope = (typeof AGENT_CONFIG_SCOPES)[number];

export const AGENT_SESSION_STATUS = {
	STARTING: "starting",
	RUNNING: "running",
	STOPPED: "stopped",
	HANDED_OFF: "handed-off",
	FAILED: "failed",
} as const;
export type AgentSessionStatus = (typeof AGENT_SESSION_STATUS)[keyof typeof AGENT_SESSION_STATUS];

export const HANDOFF_STATUS = {
	REQUESTED: "requested",
	READY: "ready",
	REPLACING: "replacing",
	FAILED: "failed",
	COMPLETED: "completed",
} as const;
export type HandoffStatus = (typeof HANDOFF_STATUS)[keyof typeof HANDOFF_STATUS];

/** Complete configurations replace their parent; fields are never inherited. */
export interface AgentPreset {
	command: string;
	env: Record<string, string>;
	prepare: string;
	worktree: boolean;
	/** How startup instructions are delivered to the agent. */
	bootstrap: AgentBootstrap;
}

export interface AgentConfiguration {
	selectedPreset: string;
	presets: Record<string, AgentPreset>;
}

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
	/** Name of the temporary backing tmux session created during launch. */
	tmuxName: string;
	cwd: string;
	createdAt: string;
	endedAt?: string;
	status: AgentSessionStatus;
	ownerPid?: number;
	predecessorId?: string;
	outputPath: string;
	bootstrapPath: string;
	error?: string;
	lastUsedAt?: string;
	useCount?: number;
}

export interface HandoffRequest {
	id: string;
	sessionId: string;
	documentPath?: string;
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
	status: HandoffStatus;
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
