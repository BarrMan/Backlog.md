import { describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import {
	findAbandonedWorkspaces,
	type ProcessTree,
	type TmuxCommandResult,
	type TmuxRunner,
	workspaceSessionName,
} from "../agent-workspace/tmux-orphan-sweep.ts";

interface FakeSession {
	name: string;
	options: Record<string, string>;
	clients: string[];
}

/** Fake tmux that records argv and answers from canned session state. */
class RecordingTmux implements TmuxRunner {
	readonly calls: string[][] = [];
	constructor(
		private readonly sessions: FakeSession[],
		private readonly listFailure?: string,
	) {}

	async run(args: readonly string[]): Promise<TmuxCommandResult> {
		const command = [...args];
		this.calls.push(command);
		const failure = (stderr: string): TmuxCommandResult => ({ exitCode: 1, stdout: "", stderr });
		if (command[0] === "list-sessions") {
			if (this.listFailure) return failure(this.listFailure);
			const names = this.sessions.map((session) => `${session.name}\n`).join("");
			return { exitCode: 0, stdout: names, stderr: "" };
		}
		const target = command.indexOf("-t");
		const name = target === -1 ? "" : (command[target + 1] ?? "");
		const session = this.sessions.find((candidate) => candidate.name === name);
		if (!session) return failure(`can't find session: ${name}`);
		if (command[0] === "show-options") {
			const option = command.at(-1) ?? "";
			const value = session.options[option];
			return value === undefined
				? failure(`unknown option: ${option}`)
				: { exitCode: 0, stdout: `${value}\n`, stderr: "" };
		}
		if (command[0] === "list-clients")
			return { exitCode: 0, stdout: session.clients.map((client) => `${client}\n`).join(""), stderr: "" };
		return { exitCode: 0, stdout: "", stderr: "" };
	}
}

class RecordingProcesses implements ProcessTree {
	readonly probed = new Set<number>();
	readonly livePids = new Set<number>();
	constructor(livePids: number[] = []) {
		for (const pid of livePids) this.livePids.add(pid);
	}

	alive(pid: number): boolean {
		this.probed.add(pid);
		return this.livePids.has(pid);
	}
}

const rootPath = realpathSync(process.cwd());
const root = rootPath;

function ownedSession(name: string, overrides: Partial<FakeSession> = {}): FakeSession {
	return { name, options: { "@backlog_workspace_owner": root }, clients: [], ...overrides };
}

function sweep(runner: RecordingTmux, options: { currentSessionName?: string; processes?: ProcessTree } = {}) {
	return findAbandonedWorkspaces({
		rootPath,
		currentSessionName: options.currentSessionName,
		runner,
		processes: options.processes ?? new RecordingProcesses(),
	});
}

describe("findAbandonedWorkspaces", () => {
	it("reports an owned workspace session with no clients and no live owner as abandoned", async () => {
		const name = workspaceSessionName(rootPath);
		const runner = new RecordingTmux([ownedSession(name)]);

		expect(await sweep(runner)).toEqual({ abandoned: [name], kept: [] });
		expect(runner.calls).toEqual([
			["list-sessions", "-F", "#{session_name}"],
			["show-options", "-qv", "-t", name, "@backlog_workspace_owner"],
			["list-clients", "-t", name, "-F", "#{client_pid}"],
			["show-options", "-qv", "-t", name, "@backlog_workspace_owner_pid"],
		]);
	});

	it("keeps a workspace session that still has an attached client", async () => {
		const name = workspaceSessionName(rootPath);
		const runner = new RecordingTmux([ownedSession(name, { clients: ["/dev/ttys001"] })]);

		expect(await sweep(runner)).toEqual({ abandoned: [], kept: [name] });
	});

	it("keeps a workspace session whose recorded owner pid is alive", async () => {
		const name = workspaceSessionName(rootPath);
		const runner = new RecordingTmux([
			ownedSession(name, {
				options: { "@backlog_workspace_owner": root, "@backlog_workspace_owner_pid": "4242" },
			}),
		]);
		const processes = new RecordingProcesses([4242]);

		expect(await sweep(runner, { processes })).toEqual({ abandoned: [], kept: [name] });
		expect(processes.probed).toEqual(new Set([4242]));
	});

	it("reports a workspace session whose recorded owner pid is dead as abandoned", async () => {
		const name = workspaceSessionName(rootPath);
		const runner = new RecordingTmux([
			ownedSession(name, {
				options: { "@backlog_workspace_owner": root, "@backlog_workspace_owner_pid": "4243" },
			}),
		]);

		expect(await sweep(runner)).toEqual({ abandoned: [name], kept: [] });
	});

	it("never touches foreign, unowned, or other-project sessions", async () => {
		const otherProject = workspaceSessionName(rootPath);
		const unowned = { name: otherProject, options: {}, clients: [] };
		const foreign = { name: "my-agent-session", options: { "@backlog_workspace_owner": root }, clients: [] };
		const runner = new RecordingTmux([
			foreign,
			{ ...ownedSession(`${workspaceSessionName(rootPath)}-other`) },
			unowned,
		]);

		const result = await sweep(runner);

		expect(result.abandoned).toEqual([]);
		// Foreign sessions are not even Backlog candidates; the two prefixed ones are kept.
		expect(result.kept).toEqual([`${workspaceSessionName(rootPath)}-other`, unowned.name]);
	});

	it("never reports the session the caller is currently using", async () => {
		const name = workspaceSessionName(rootPath);
		const runner = new RecordingTmux([ownedSession(name)]);

		expect(await sweep(runner, { currentSessionName: name })).toEqual({ abandoned: [], kept: [name] });
	});

	it("is a no-op success when the session or the tmux server is absent", async () => {
		for (const stderr of [
			"no server running on /tmp/tmux-1000/default",
			"error connecting to /tmp/tmux-1000/default",
		]) {
			const runner = new RecordingTmux([], stderr);
			expect(await sweep(runner)).toEqual({ abandoned: [], kept: [] });
			expect(runner.calls).toEqual([["list-sessions", "-F", "#{session_name}"]]);
		}

		expect(await sweep(new RecordingTmux([]))).toEqual({ abandoned: [], kept: [] });
	});

	it("treats a session tmux can no longer find as abandoned, not failed", async () => {
		const name = workspaceSessionName(rootPath);
		const session = ownedSession(name);
		const runner = new RecordingTmux([session]);
		runner.run = async (args: readonly string[]): Promise<TmuxCommandResult> => {
			if (args[0] === "list-clients") return { exitCode: 1, stdout: "", stderr: `can't find session: ${name}` };
			return await new RecordingTmux([session]).run(args);
		};

		expect(await sweep(runner)).toEqual({ abandoned: [name], kept: [] });
	});

	it("fails loudly when tmux reports an unexpected listing error", async () => {
		const runner = new RecordingTmux([], "permission denied");
		await expect(sweep(runner)).rejects.toThrow("Could not list tmux sessions: permission denied");
	});
});
