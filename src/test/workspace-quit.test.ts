import { describe, expect, it } from "bun:test";
import { formatKeymap } from "../ui/keymap.ts";
import { getWorkspaceFooterContent } from "../ui/workspace/footer.ts";
import { quitWorkspaceHost } from "../ui/workspace/native-regions.ts";

const quitKeys = formatKeymap("shared", "quitWithoutEscape");

function withTmuxWorkspace<T>(value: string | undefined, run: () => T): T {
	const previous = process.env.BACKLOG_TMUX_WORKSPACE;
	if (value === undefined) delete process.env.BACKLOG_TMUX_WORKSPACE;
	else process.env.BACKLOG_TMUX_WORKSPACE = value;
	try {
		return run();
	} finally {
		if (previous === undefined) delete process.env.BACKLOG_TMUX_WORKSPACE;
		else process.env.BACKLOG_TMUX_WORKSPACE = previous;
	}
}

describe("quitting the workspace", () => {
	it("tears the workspace down when the host exposes quitWorkspace", async () => {
		const calls: string[] = [];
		await quitWorkspaceHost({
			quitWorkspace: async () => {
				calls.push("quitWorkspace");
			},
			detach: async () => {
				calls.push("detach");
			},
		});
		expect(calls).toEqual(["quitWorkspace"]);
	});

	it("falls back to detach for hosts without quitWorkspace", async () => {
		const calls: string[] = [];
		await quitWorkspaceHost({
			detach: async () => {
				calls.push("detach");
			},
		});
		expect(calls).toEqual(["detach"]);
	});

	it("resolves when the host can do neither", async () => {
		await quitWorkspaceHost({});
	});

	it("propagates a failed teardown so the caller can surface it", async () => {
		await expect(
			quitWorkspaceHost({
				quitWorkspace: async () => {
					throw new Error("tmux teardown failed");
				},
			}),
		).rejects.toThrow("tmux teardown failed");
	});

	it("labels the quit key by what it actually does", () => {
		const insideTmux = withTmuxWorkspace("backlog-workspace-abc", () => getWorkspaceFooterContent("tasks"));
		const outsideTmux = withTmuxWorkspace(undefined, () => getWorkspaceFooterContent("tasks"));
		expect(insideTmux).toContain(`[${quitKeys}] Back`);
		expect(insideTmux).not.toContain(`[${quitKeys}] Close`);
		expect(outsideTmux).toContain(`[${quitKeys}] Close`);
	});
});
