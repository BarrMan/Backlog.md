import { join } from "node:path";
import { captureProcessOutput } from "../process/capture.ts";

export function getTestCliCommand(): string[] {
	const binary = process.env.BACKLOG_TEST_CLI_BINARY?.trim();
	return binary ? [binary] : [process.execPath, join(process.cwd(), "src", "cli", "index.ts")];
}

/**
 * Real tmux panes launch the real CLI, so a test host must present the CLI entrypoint as its own
 * entrypoint: under `bun test` `process.argv[1]` is the test file, which makes every pane a script
 * that dies on sight.
 */
export async function withTestCliEntrypoint<T>(run: () => Promise<T>): Promise<T> {
	const binary = process.env.BACKLOG_TEST_CLI_BINARY?.trim();
	const original = process.argv[1];
	process.argv[1] = binary ?? join(process.cwd(), "src", "cli", "index.ts");
	try {
		return await run();
	} finally {
		if (original === undefined) process.argv.splice(1, 1);
		else process.argv[1] = original;
	}
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
