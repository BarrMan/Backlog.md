import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Use the source CLI during development and the running binary after compilation. */
export async function spawnSessionWorker(
	action: "handoff-dispatch" | "handoff-continue",
	taskId: string,
	projectRoot: string,
): Promise<void> {
	const source = fileURLToPath(new URL("../cli.ts", import.meta.url));
	const args = [
		...(existsSync(source) && !source.includes("$bunfs") ? [source] : []),
		"agent-session",
		action,
		taskId,
		"--worker",
	];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, args, {
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
