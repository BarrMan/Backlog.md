import type { AgentConfiguration, AgentPreset } from "../agent-workspace/types.ts";

export function parsePresetEnvironment(value: string): Record<string, string> {
	const environment: Record<string, string> = {};
	for (const line of value.split("\n")) {
		if (!line.trim()) continue;
		const separator = line.indexOf("=");
		const name = (separator < 0 ? line : line.slice(0, separator)).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
			throw new Error(`Invalid environment variable name: ${name || "(empty)"}.`);
		}
		environment[name] = separator < 0 ? "" : line.slice(separator + 1);
	}
	return environment;
}

export function updatePresetConfiguration(
	configuration: AgentConfiguration,
	selectedPreset: string,
	values: Pick<AgentPreset, "command" | "prepare" | "worktree" | "bootstrap"> & { environment: Record<string, string> },
): AgentConfiguration {
	if (!values.command.trim()) throw new Error("Command is required.");
	return {
		...configuration,
		selectedPreset,
		presets: {
			...configuration.presets,
			[selectedPreset]: {
				command: values.command,
				env: values.environment,
				prepare: values.prepare,
				worktree: values.worktree,
				bootstrap: values.bootstrap,
			},
		},
	};
}
