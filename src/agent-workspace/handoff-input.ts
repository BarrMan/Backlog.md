import type { AgentPreset } from "./types.ts";

const EMPTY_PROMPTS: Record<AgentPreset["bootstrap"], readonly string[]> = {
	opencode: [">", ">>", "›"],
	claude: ["❯"],
	codex: ["›", "❯"],
	gemini: [">"],
	antigravity: [">"],
	prompt: [">"],
};

function withoutAnsi(value: string): string {
	return value.replaceAll(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}

/** Only accept a provider's complete, empty composer line; never infer from a suffix. */
export function hasEmptyHandoffInput(provider: AgentPreset["bootstrap"], pane: string, cursorRow?: number): boolean {
	const lines = withoutAnsi(pane).split("\n");
	// Cursor position selects the composer rather than the model/footer beneath it.
	// Never inject into a permission dialog or a running turn's queue.
	if (/(?:esc|ctrl\+c) (?:to )?interrupt|enter to select|esc to cancel/i.test(lines.slice(-12).join("\n")))
		return false;
	const line =
		(cursorRow === undefined ? lines.findLast((candidate) => candidate.trim()) : lines[cursorRow])?.trim() ?? "";
	return EMPTY_PROMPTS[provider].includes(line);
}
