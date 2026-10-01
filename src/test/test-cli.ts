import { join } from "node:path";
import { captureProcessOutput } from "../process/capture.ts";

export function getTestCliCommand(): string[] {
	const binary = process.env.BACKLOG_TEST_CLI_BINARY?.trim();
	return binary ? [binary] : [process.execPath, join(process.cwd(), "src", "cli", "index.ts")];
}

export async function runTestCli(
	args: string[],
	options: { cwd: string; env?: Record<string, string | undefined> },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const child = Bun.spawn([...getTestCliCommand(), ...args], {
		cwd: options.cwd,
		env: options.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return await captureProcessOutput(child);
}
