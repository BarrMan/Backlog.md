import { DEFAULT_FRESH_INIT_POLICY, DEFAULT_STATUSES } from "../constants/index.ts";
import { parseFrontmatter } from "../markdown/frontmatter.ts";
import type { BacklogConfig } from "../types/index.ts";

type ConfigListKey = "statuses" | "labels" | "types" | "priorities" | "projects" | "default_assignee";

const CONFIG_KEY_LINE_PATTERN = /^\s*(?!-\s)[^\s#][^:]*:/;
const CONFIG_VALUE_ERROR_NAME = "ConfigValueError";

function extractConfigKeyYaml(content: string, key: string): string | undefined {
	const lines = content.split(/\r?\n/);
	const keyPattern = new RegExp(`^(\\s*)${key}\\s*:`);
	const keyIndent = (line: string) => line.match(keyPattern)?.[1]?.length;
	const startIndex = lines.some((line) => keyIndent(line) === 0)
		? lines.findLastIndex((line) => keyIndent(line) === 0)
		: lines.findLastIndex((line) => keyIndent(line) !== undefined);
	if (startIndex === -1) return undefined;

	const startIndent = keyIndent(lines[startIndex] ?? "") ?? 0;
	const collected: string[] = [];
	for (let index = startIndex; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		const indent = line.length - line.trimStart().length;
		if (index > startIndex && trimmed.length > 0 && indent <= startIndent && CONFIG_KEY_LINE_PATTERN.test(line)) break;
		collected.push(line);
	}
	return collected.join("\n");
}

function configValueError(configPath: string, key: string, problem: string, remedy: string): Error {
	const error = new Error(
		`Backlog could not start because ${configPath} has an invalid value for "${key}"${problem ? `: ${problem}` : ""}. ${remedy}`,
	);
	error.name = CONFIG_VALUE_ERROR_NAME;
	return error;
}

function configSyntaxError(configPath: string, key: string, reason: unknown): Error {
	const detail = (reason instanceof Error ? reason.message : String(reason)).split("\n")[0]?.trim();
	return configValueError(
		configPath,
		key,
		detail ?? "",
		"Edit that key so its value is valid YAML, then run the command again.",
	);
}

function describeConfigValue(value: unknown): string {
	if (value === undefined) return "no value Backlog could read";
	switch (typeof value) {
		case "string":
			return "a scalar";
		case "number":
			return "a number";
		case "boolean":
			return "a boolean";
		default:
			return "a mapping";
	}
}

function configTypeError(configPath: string, key: ConfigListKey, value: unknown): Error {
	const expected = key === "default_assignee" ? "a list or a single name" : "a list";
	return configValueError(
		configPath,
		key,
		`expected ${expected}, got ${describeConfigValue(value)}`,
		`Edit that key so its value is ${expected}, then run the command again.`,
	);
}

export function isConfigValueError(error: unknown): error is Error {
	return error instanceof Error && error.name === CONFIG_VALUE_ERROR_NAME;
}

function readYamlKey(document: string, key: string): { value: unknown } | { error: unknown } {
	try {
		return { value: (Bun.YAML.parse(document) as Record<string, unknown> | null)?.[key] };
	} catch (error) {
		return { error };
	}
}

function parseConfigListValue(content: string, key: ConfigListKey, configPath: string): string[] | undefined {
	const block = extractConfigKeyYaml(content, key);
	if (block === undefined) return undefined;
	const fromBlock = readYamlKey(block, key);
	const parsed =
		"value" in fromBlock
			? fromBlock.value
			: (() => {
					const fromDocument = readYamlKey(content, key);
					if (!("value" in fromDocument)) throw configSyntaxError(configPath, key, fromBlock.error);
					return fromDocument.value;
				})();
	if (parsed === null) return key === "default_assignee" ? [] : undefined;
	if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
	if (typeof parsed === "string" && key === "default_assignee") {
		const value = parsed.trim();
		return value ? [value] : [];
	}
	throw configTypeError(configPath, key, parsed);
}

function normalizeDefinitionOfDone(definitionOfDone: unknown): string[] | undefined {
	if (!Array.isArray(definitionOfDone)) return undefined;
	return definitionOfDone
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseDefinitionOfDoneFromYaml(content: string): string[] | undefined {
	try {
		const { data } = parseFrontmatter(`---\n${content.trimEnd()}\n---\n`);
		if (!Object.hasOwn(data, "definition_of_done")) return undefined;
		return data.definition_of_done === null ? [] : normalizeDefinitionOfDone(data.definition_of_done);
	} catch {
		return undefined;
	}
}

function escapeLegacyDefinitionOfDoneBackslashes(content: string): string | undefined {
	let escaped = "";
	let quote: "'" | '"' | undefined;
	let changed = false;
	for (let index = 0; index < content.length; index++) {
		const char = content[index];
		if (quote) {
			if (quote === '"' && char === "\\") {
				let slashCount = 1;
				while (content[index + slashCount] === "\\") slashCount++;
				const nextChar = content[index + slashCount];
				if (nextChar === '"' && slashCount % 2 === 1) {
					escaped += "\\".repeat(slashCount) + nextChar;
					index += slashCount;
					continue;
				}
				const escapedSlashCount = slashCount % 2 === 1 ? slashCount + 1 : slashCount;
				escaped += "\\".repeat(escapedSlashCount);
				changed ||= escapedSlashCount !== slashCount;
				index += slashCount - 1;
				continue;
			}
			if (char === quote) quote = undefined;
			escaped += char;
			continue;
		}
		if (char === "'" || char === '"') quote = char;
		escaped += char;
	}
	return changed ? escaped : undefined;
}

function parseDefinitionOfDone(content: string): string[] | undefined {
	const yaml = extractConfigKeyYaml(content, "definition_of_done");
	const escaped = yaml ? escapeLegacyDefinitionOfDoneBackslashes(yaml) : undefined;
	return (
		(escaped ? parseDefinitionOfDoneFromYaml(escaped) : undefined) ??
		parseDefinitionOfDoneFromYaml(content) ??
		(yaml ? parseDefinitionOfDoneFromYaml(yaml) : undefined)
	);
}

export function parseConfig(content: string, configPath: string): BacklogConfig {
	const config: Partial<BacklogConfig> = {};
	const parseListValue = (key: ConfigListKey) => parseConfigListValue(content, key, configPath);
	config.statuses = parseListValue("statuses");
	config.labels = parseListValue("labels");
	config.types = parseListValue("types");
	config.priorities = parseListValue("priorities");
	config.projects = parseListValue("projects");
	config.defaultAssignee = parseListValue("default_assignee");
	const definitionOfDone = parseDefinitionOfDone(content);
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) continue;
		const key = trimmed.substring(0, colonIndex).trim();
		const value = trimmed.substring(colonIndex + 1).trim();
		switch (key) {
			case "project_name":
				config.projectName = value.replace(/['"]/g, "");
				break;
			case "default_reporter":
				config.defaultReporter = value.replace(/['"]/g, "");
				break;
			case "default_status":
				config.defaultStatus = value.replace(/['"]/g, "");
				break;
			case "definition_of_done":
				config.definitionOfDone = definitionOfDone;
				break;
			case "date_format":
				config.dateFormat = value.replace(/['"]/g, "");
				break;
			case "max_column_width":
				config.maxColumnWidth = Number.parseInt(value, 10);
				break;
			case "default_editor":
				config.defaultEditor = value.replace(/["']/g, "");
				break;
			case "auto_open_browser":
				config.autoOpenBrowser = value.toLowerCase() === "true";
				break;
			case "hide_empty_columns":
				config.hideEmptyColumns = value.toLowerCase() === "true";
				break;
			case "default_port":
				config.defaultPort = Number.parseInt(value, 10);
				break;
			case "remote_operations":
				config.remoteOperations = value.toLowerCase() === "true";
				break;
			case "auto_commit":
				config.autoCommit = value.toLowerCase() === "true";
				break;
			case "filesystem_only":
			case "filesystemOnly":
				config.filesystemOnly = value.toLowerCase() === "true";
				break;
			case "zero_padded_ids":
				config.zeroPaddedIds = Number.parseInt(value, 10);
				break;
			case "bypass_git_hooks":
				config.bypassGitHooks = value.toLowerCase() === "true";
				break;
			case "check_active_branches":
				config.checkActiveBranches = value.toLowerCase() === "true";
				break;
			case "active_branch_days":
				config.activeBranchDays = Number.parseInt(value, 10);
				break;
			case "onStatusChange":
			case "on_status_change":
				config.onStatusChange = value.replace(/^['"]|['"]$/g, "");
				break;
			case "task_prefix":
				config.prefixes = { task: value.replace(/['"]/g, "") };
				break;
			case "backlog_directory":
			case "backlogDirectory":
				config.backlogDirectory = value.replace(/['"]/g, "");
				break;
		}
	}
	return {
		projectName: config.projectName || "",
		defaultAssignee: config.defaultAssignee,
		defaultReporter: config.defaultReporter,
		statuses: config.statuses || [...DEFAULT_STATUSES],
		labels: config.labels || [],
		types: config.types,
		priorities: config.priorities,
		projects: config.projects,
		definitionOfDone: config.definitionOfDone,
		defaultStatus: config.defaultStatus,
		dateFormat: config.dateFormat || DEFAULT_FRESH_INIT_POLICY.dateFormat,
		maxColumnWidth: config.maxColumnWidth,
		defaultEditor: config.defaultEditor,
		autoOpenBrowser: config.autoOpenBrowser,
		hideEmptyColumns: config.hideEmptyColumns,
		defaultPort: config.defaultPort,
		remoteOperations: config.remoteOperations,
		autoCommit: config.autoCommit,
		filesystemOnly: config.filesystemOnly,
		zeroPaddedIds: config.zeroPaddedIds,
		bypassGitHooks: config.bypassGitHooks,
		checkActiveBranches: config.checkActiveBranches,
		activeBranchDays: config.activeBranchDays,
		onStatusChange: config.onStatusChange,
		prefixes: config.prefixes,
		backlogDirectory: config.backlogDirectory,
	};
}

export function serializeConfig(config: BacklogConfig): string {
	const definitionOfDone = normalizeDefinitionOfDone(config.definitionOfDone);
	const quote = (value: string) => JSON.stringify(value);
	const lines = [
		`project_name: "${config.projectName}"`,
		...(config.defaultAssignee?.length ? [`default_assignee: [${config.defaultAssignee.map(quote).join(", ")}]`] : []),
		...(config.defaultReporter ? [`default_reporter: "${config.defaultReporter}"`] : []),
		...(config.defaultStatus ? [`default_status: "${config.defaultStatus}"`] : []),
		`statuses: [${config.statuses.map((value) => `"${value}"`).join(", ")}]`,
		`labels: [${config.labels.map((value) => `"${value}"`).join(", ")}]`,
		...(config.types?.length ? [`types: [${config.types.map((value) => `"${value}"`).join(", ")}]`] : []),
		...(config.priorities?.length
			? [`priorities: [${config.priorities.map((value) => `"${value}"`).join(", ")}]`]
			: []),
		...(config.projects?.length ? [`projects: [${config.projects.map((value) => `"${value}"`).join(", ")}]`] : []),
		...(definitionOfDone ? [`definition_of_done: [${definitionOfDone.map(quote).join(", ")}]`] : []),
		`date_format: ${config.dateFormat}`,
		...(config.maxColumnWidth ? [`max_column_width: ${config.maxColumnWidth}`] : []),
		...(config.defaultEditor ? [`default_editor: "${config.defaultEditor}"`] : []),
		...(typeof config.autoOpenBrowser === "boolean" ? [`auto_open_browser: ${config.autoOpenBrowser}`] : []),
		...(typeof config.hideEmptyColumns === "boolean" ? [`hide_empty_columns: ${config.hideEmptyColumns}`] : []),
		...(config.defaultPort ? [`default_port: ${config.defaultPort}`] : []),
		...(typeof config.remoteOperations === "boolean" ? [`remote_operations: ${config.remoteOperations}`] : []),
		...(typeof config.autoCommit === "boolean" ? [`auto_commit: ${config.autoCommit}`] : []),
		...(typeof config.filesystemOnly === "boolean" ? [`filesystem_only: ${config.filesystemOnly}`] : []),
		...(typeof config.zeroPaddedIds === "number" ? [`zero_padded_ids: ${config.zeroPaddedIds}`] : []),
		...(typeof config.bypassGitHooks === "boolean" ? [`bypass_git_hooks: ${config.bypassGitHooks}`] : []),
		...(typeof config.checkActiveBranches === "boolean"
			? [`check_active_branches: ${config.checkActiveBranches}`]
			: []),
		...(typeof config.activeBranchDays === "number" ? [`active_branch_days: ${config.activeBranchDays}`] : []),
		...(config.onStatusChange ? [`onStatusChange: '${config.onStatusChange}'`] : []),
		...(config.prefixes?.task ? [`task_prefix: "${config.prefixes.task}"`] : []),
		...(config.backlogDirectory ? [`backlog_directory: "${config.backlogDirectory}"`] : []),
	];
	return `${lines.join("\n")}\n`;
}

export function normalizedDefinitionOfDone(value: unknown): string[] | undefined {
	return normalizeDefinitionOfDone(value);
}
