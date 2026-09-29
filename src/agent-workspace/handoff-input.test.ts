import { describe, expect, it } from "bun:test";
import { hasEmptyHandoffInput } from "./handoff-input.ts";

describe("hasEmptyHandoffInput", () => {
	it("accepts only complete empty composer lines for each provider", () => {
		expect(hasEmptyHandoffInput("opencode", "status\n\x1b[36m>\x1b[0m ")).toBe(true);
		expect(hasEmptyHandoffInput("claude", "context\n❯ ")).toBe(true);
		expect(hasEmptyHandoffInput("codex", "tokens\n› ")).toBe(true);
		expect(hasEmptyHandoffInput("gemini", "ready\n> ")).toBe(true);
	});

	it("does not submit typed drafts that merely end in a prompt character", () => {
		for (const draft of ["write $", "continue >", "shell $", "❯ draft"]) {
			expect(hasEmptyHandoffInput("opencode", `header\n> ${draft}`)).toBe(false);
		}
	});

	it("uses the tmux cursor row instead of a later prompt-looking footer", () => {
		expect(hasEmptyHandoffInput("opencode", "> typed draft\n> ", 0)).toBe(false);
		expect(hasEmptyHandoffInput("opencode", "> typed draft\n> ", 1)).toBe(true);
	});
});
