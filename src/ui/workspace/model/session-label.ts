import type { AgentSession } from "../../../agent-workspace/types.ts";

export function sessionLabel(session?: AgentSession): string {
	if (!session) return "No active session";
	return `${session.status} · ${session.preset} · ${session.id.slice(0, 8)}`;
}
