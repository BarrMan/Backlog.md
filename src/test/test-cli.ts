import { join } from "node:path";
import { captureProcessOutput } from "../process/capture.ts";

export function getTestCliPath(): string {
	return process.env.BACKLOG_TEST_CLI_BUNDLE?.trim() || join(process.cwd(), "src", "cli.ts");
}

export async function runTestCli(
	args: string[],
	options: { cwd: string; env?: Record<string, string | undefined> },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const child = Bun.spawn(["bun", getTestCliPath(), ...args], {
		cwd: options.cwd,
		env: options.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return await captureProcessOutput(child);
}
