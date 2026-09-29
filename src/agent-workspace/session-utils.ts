export interface SessionCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export function fail(prefix: string, result: Pick<SessionCommandResult, "stdout" | "stderr">): Error {
	const detail = (result.stderr || result.stdout).trim();
	return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

export function slug(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-|-$/g, "");
}
