import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type SessionWorkerAction = "handoff-continue";

/** Launches a detached CLI worker without coupling session state to the CLI module graph. */
export async function spawnSessionWorker(
	action: SessionWorkerAction,
	taskId: string,
	projectRoot: string,
	spawnProcess: typeof spawn = spawn,
): Promise<void> {
	const source = join(dirname(fileURLToPath(import.meta.url)), "..", "cli", "index.ts");
	const args = [
		...(existsSync(source) && !source.includes("$bunfs") ? [source] : []),
		"agent-session",
		action,
		taskId,
		"--worker",
	];
	await new Promise<void>((resolve, reject) => {
		const child = spawnProcess(process.execPath, args, {
			cwd: projectRoot,
			detached: true,
			stdio: "ignore",
			env: { ...process.env, BACKLOG_CWD: projectRoot },
		});
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
