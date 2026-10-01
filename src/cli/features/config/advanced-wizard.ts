import * as clack from "@clack/prompts";
import { DEFAULT_INIT_CONFIG } from "../../../constants/index.ts";
import type { BacklogConfig } from "../../../types/index.ts";
import { isEditorAvailable as checkEditorAvailability, resolveEditor } from "../../../utils/editor.ts";

export interface PromptChoice {
	title: string;
	value: string | number | boolean;
	description?: string;
	disabled?: boolean;
}

export interface PromptQuestion {
	type: "confirm" | "number" | "text" | "select" | "multiselect";
	name: string;
	message: string;
	hint?: string;
	initial?: string | number | boolean;
	min?: number;
	max?: number;
	choices?: PromptChoice[];
}

export interface PromptOptions {
	onCancel?: () => void;
}

export type PromptRunner = (
	question: PromptQuestion | PromptQuestion[],
	options?: PromptOptions,
) => Promise<Record<string, unknown>>;

export type EditorAvailabilityChecker = (editor: string) => Promise<boolean>;

export interface WizardOptions {
	existingConfig?: BacklogConfig | null;
	cancelMessage: string;
	includeClaudePrompt?: boolean;
	promptImpl?: PromptRunner;
	isEditorAvailable?: EditorAvailabilityChecker;
}

export interface AdvancedConfigWizardResult {
	config: Partial<BacklogConfig>;
	installClaudeAgent: boolean;
	installShellCompletions: boolean;
}

type DefinitionOfDoneAction = "add" | "remove" | "reorder" | "clear" | "done";
type WizardConfig = Omit<
	Pick<
		BacklogConfig,
		| "checkActiveBranches"
		| "remoteOperations"
		| "activeBranchDays"
		| "bypassGitHooks"
		| "autoCommit"
		| "zeroPaddedIds"
		| "defaultEditor"
		| "definitionOfDone"
		| "defaultPort"
		| "autoOpenBrowser"
	>,
	"definitionOfDone"
> & { definitionOfDone: string[] };
type WizardConfigKey = keyof WizardConfig;

interface PromptContext {
	prompt: PromptRunner;
	onCancel: () => void;
}

interface FieldDescriptor<K extends WizardConfigKey> {
	key: K;
	question: Omit<PromptQuestion, "name" | "initial">;
	isValue: (value: unknown) => value is WizardConfig[K];
}

function handlePromptCancel(message: string) {
	clack.cancel(message);
	process.exit(1);
}

function withHint(message: string, hint?: string): string {
	return hint ? `${message} (${hint})` : message;
}

function promptChoices(choices: PromptChoice[] = []) {
	return choices.map((choice) => ({
		label: choice.title,
		value: choice.value,
		hint: choice.description,
		disabled: choice.disabled,
	}));
}

function normalizeDefinitionOfDoneItems(items: string[] | undefined): string[] {
	return (items ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
}

function renderDefinitionOfDonePreview(items: string[]): string {
	if (items.length === 0) {
		return "Current defaults:\n  (none)";
	}
	return `Current defaults:\n${items.map((item, index) => `  ${index + 1}. ${item}`).join("\n")}`;
}

function cancelled(result: unknown, onCancel?: () => void): boolean {
	if (!clack.isCancel(result)) {
		return false;
	}
	onCancel?.();
	return true;
}

async function runConfirmPrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const result = await clack.confirm({
		message: withHint(question.message, question.hint),
		initialValue: Boolean(question.initial ?? false),
	});
	return cancelled(result, options?.onCancel) ? {} : { [question.name]: result };
}

async function runTextPrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const result = await clack.text({
		message: withHint(question.message, question.hint),
		initialValue: typeof question.initial === "string" ? question.initial : undefined,
	});
	return cancelled(result, options?.onCancel) ? {} : { [question.name]: String(result ?? "").trim() };
}

async function runNumberPrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const initial = typeof question.initial === "number" ? question.initial : undefined;
	const result = await clack.text({
		message: withHint(question.message, question.hint),
		initialValue: initial === undefined ? undefined : String(initial),
		validate: (value) => validateNumber(value, question, initial),
	});
	if (cancelled(result, options?.onCancel)) {
		return {};
	}
	const value = String(result ?? "").trim();
	return { [question.name]: value ? Number(value) : initial };
}

function validateNumber(value: unknown, question: PromptQuestion, initial: number | undefined): string | undefined {
	const normalized = String(value ?? "").trim();
	if (!normalized) {
		return initial === undefined ? "Value is required." : undefined;
	}
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) {
		return "Please enter a valid number.";
	}
	if (question.min !== undefined && parsed < question.min) {
		return `Value must be at least ${question.min}.`;
	}
	return question.max !== undefined && parsed > question.max ? `Value must be at most ${question.max}.` : undefined;
}

async function runChoicePrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const result =
		question.type === "select"
			? await clack.select({
					message: withHint(question.message, question.hint),
					initialValue: question.initial,
					options: promptChoices(question.choices),
				})
			: await clack.multiselect({
					message: withHint(question.message, question.hint),
					required: false,
					options: promptChoices(question.choices),
				});
	if (cancelled(result, options?.onCancel)) {
		return {};
	}
	return { [question.name]: question.type === "multiselect" ? (Array.isArray(result) ? result : []) : result };
}

async function runSinglePrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	if (question.type === "confirm") {
		return runConfirmPrompt(question, options);
	}
	if (question.type === "text") {
		return runTextPrompt(question, options);
	}
	if (question.type === "number") {
		return runNumberPrompt(question, options);
	}
	return runChoicePrompt(question, options);
}

const clackPromptRunner: PromptRunner = async (question, options) => {
	if (!Array.isArray(question)) {
		return runSinglePrompt(question, options);
	}
	const merged: Record<string, unknown> = {};
	for (const single of question) {
		let didCancel = false;
		Object.assign(
			merged,
			await runSinglePrompt(single, {
				onCancel: () => {
					didCancel = true;
					options?.onCancel?.();
				},
			}),
		);
		if (didCancel) {
			break;
		}
	}
	return merged;
};

async function ask(context: PromptContext, question: PromptQuestion | PromptQuestion[]) {
	return context.prompt(question, { onCancel: context.onCancel });
}

async function promptFields<K extends WizardConfigKey>(
	context: PromptContext,
	initial: Pick<WizardConfig, K>,
	descriptors: readonly FieldDescriptor<K>[],
): Promise<Pick<WizardConfig, K>> {
	const values: Partial<WizardConfig> = {};
	for (const descriptor of descriptors) {
		const response = await ask(context, {
			...descriptor.question,
			name: descriptor.key,
			initial: initial[descriptor.key] as PromptQuestion["initial"],
		});
		const value = response[descriptor.key];
		values[descriptor.key] = descriptor.isValue(value) ? value : initial[descriptor.key];
	}
	return values as Pick<WizardConfig, K>;
}

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNumber = (value: unknown): value is number => typeof value === "number" && !Number.isNaN(value);

async function promptGitSettings(
	context: PromptContext,
	initial: Pick<
		WizardConfig,
		"checkActiveBranches" | "remoteOperations" | "activeBranchDays" | "bypassGitHooks" | "autoCommit"
	>,
) {
	const { checkActiveBranches } = await promptFields(context, { checkActiveBranches: initial.checkActiveBranches }, [
		{
			key: "checkActiveBranches",
			question: {
				type: "confirm",
				message: "Check task states across active branches?",
				hint: "Ensures accurate task tracking across branches (may impact performance on large repos)",
			},
			isValue: isBoolean,
		},
	]);
	const branchSettings = checkActiveBranches
		? await promptFields(
				context,
				{ remoteOperations: initial.remoteOperations, activeBranchDays: initial.activeBranchDays },
				[
					{
						key: "remoteOperations",
						question: {
							type: "confirm",
							message: "Check task states in remote branches?",
							hint: "Required for accessing tasks from feature branches on remote repos",
						},
						isValue: isBoolean,
					},
					{
						key: "activeBranchDays",
						question: {
							type: "number",
							message: "How many days should a branch be considered active?",
							hint: "Lower values improve performance (default: 30 days)",
							min: 1,
							max: 365,
						},
						isValue: isNumber,
					},
				],
			)
		: { remoteOperations: false, activeBranchDays: initial.activeBranchDays };
	const commitSettings = await promptFields(
		context,
		{ bypassGitHooks: initial.bypassGitHooks, autoCommit: initial.autoCommit },
		[
			{
				key: "bypassGitHooks",
				question: {
					type: "confirm",
					message: "Bypass git hooks when committing?",
					hint: "Use --no-verify flag to skip pre-commit hooks",
				},
				isValue: isBoolean,
			},
			{
				key: "autoCommit",
				question: {
					type: "confirm",
					message: "Enable automatic commits for Backlog operations?",
					hint: "Creates commits automatically after CLI changes",
				},
				isValue: isBoolean,
			},
		],
	);
	return { checkActiveBranches, ...branchSettings, ...commitSettings };
}

async function promptZeroPadding(context: PromptContext, initial: number | undefined): Promise<number | undefined> {
	while (true) {
		const enabled = await ask(context, {
			type: "confirm",
			name: "enableZeroPadding",
			message: "Enable zero-padded IDs for consistent formatting?",
			hint: "Example: task-001, doc-001 instead of task-1, doc-1",
			initial: (initial ?? 0) > 0,
		});
		if (!enabled.enableZeroPadding) {
			return undefined;
		}
		let goBack = false;
		const width = await context.prompt(
			{
				type: "number",
				name: "paddingWidth",
				message: "Number of digits for zero-padding:",
				hint: "e.g., 3 creates task-001; 4 creates task-0001",
				initial: initial ?? 3,
				min: 1,
				max: 10,
			},
			{
				onCancel: () => {
					goBack = true;
				},
			},
		);
		if (goBack) {
			continue;
		}
		if (isNumber(width.paddingWidth)) {
			return width.paddingWidth;
		}
	}
}

async function promptEditor(
	context: PromptContext,
	initial: string | undefined,
	isEditorAvailable: EditorAvailabilityChecker,
): Promise<string | undefined> {
	const response = await ask(context, {
		type: "text",
		name: "editor",
		message: "Default editor command (leave blank to use system default):",
		hint: "e.g., 'code --wait', 'vim', 'nano'",
		initial: initial ?? "",
	});
	let editor = String(response.editor ?? "").trim();
	if (editor && !(await isEditorAvailable(editor))) {
		console.warn(`Warning: Editor command '${editor}' not found in PATH`);
		const confirmed = await ask(context, {
			type: "confirm",
			name: "confirm",
			message: "Editor not found. Set it anyway?",
			initial: false,
		});
		if (!confirmed.confirm) {
			editor = "";
		}
	}
	return editor || undefined;
}

async function promptDefinitionOfDone(context: PromptContext, initial: string[]): Promise<string[]> {
	let items = normalizeDefinitionOfDoneItems(initial);
	while (true) {
		const response = await ask(context, {
			type: "select",
			name: "definitionOfDoneAction",
			message: `Edit Definition of Done defaults\n\n${renderDefinitionOfDonePreview(items)}\n\nChoose an action:`,
			initial: items.length > 0 ? "done" : "add",
			choices: [
				{ title: "Add item", value: "add", description: "Append a new checklist item" },
				{
					title: "Remove item by index",
					value: "remove",
					description: "Delete one item from the list",
					disabled: items.length === 0,
				},
				{
					title: "Reorder items",
					value: "reorder",
					description: "Move an item to a different position",
					disabled: items.length < 2,
				},
				{
					title: "Clear all items",
					value: "clear",
					description: "Remove every default checklist item",
					disabled: items.length === 0,
				},
				{ title: "Done", value: "done", description: "Keep these Definition of Done defaults" },
			],
		});
		const action = String(response.definitionOfDoneAction ?? "done") as DefinitionOfDoneAction;
		if (action === "done") return items;
		if (action === "add") items = await addDefinitionOfDoneItem(context, items);
		if (action === "remove") items = await removeDefinitionOfDoneItem(context, items);
		if (action === "reorder") items = await reorderDefinitionOfDoneItems(context, items);
		if (action === "clear") items = await clearDefinitionOfDoneItems(context, items);
	}
}

async function promptDefinitionOfDoneAction(context: PromptContext, question: PromptQuestion | PromptQuestion[]) {
	let cancelled = false;
	const response = await context.prompt(question, {
		onCancel: () => {
			cancelled = true;
		},
	});
	return { cancelled, response };
}

async function addDefinitionOfDoneItem(context: PromptContext, items: string[]): Promise<string[]> {
	const { cancelled, response } = await promptDefinitionOfDoneAction(context, {
		type: "text",
		name: "definitionOfDoneItem",
		message: "New Definition of Done item:",
		hint: "Item is trimmed; empty input is ignored",
	});
	const item = String(response.definitionOfDoneItem ?? "").trim();
	return cancelled || !item ? items : [...items, item];
}

async function removeDefinitionOfDoneItem(context: PromptContext, items: string[]): Promise<string[]> {
	const { cancelled, response } = await promptDefinitionOfDoneAction(context, {
		type: "number",
		name: "removeDefinitionOfDoneIndex",
		message: "Remove which item number?",
		hint: `Enter a value between 1 and ${items.length}`,
		initial: items.length,
		min: 1,
		max: items.length,
	});
	const index = Number(response.removeDefinitionOfDoneIndex);
	return cancelled || !Number.isInteger(index) || index < 1 || index > items.length
		? items
		: items.filter((_, itemIndex) => itemIndex !== index - 1);
}

async function reorderDefinitionOfDoneItems(context: PromptContext, items: string[]): Promise<string[]> {
	const { cancelled, response } = await promptDefinitionOfDoneAction(context, [
		{
			type: "number",
			name: "moveFromIndex",
			message: "Move which item number?",
			hint: `Enter a value between 1 and ${items.length}`,
			initial: items.length,
			min: 1,
			max: items.length,
		},
		{
			type: "number",
			name: "moveToIndex",
			message: "Move to which position?",
			hint: `Enter a value between 1 and ${items.length}`,
			initial: 1,
			min: 1,
			max: items.length,
		},
	]);
	const from = Number(response.moveFromIndex);
	const to = Number(response.moveToIndex);
	if (cancelled || !isValidDefinitionOfDoneReorder(from, to, items.length)) return items;
	const reordered = [...items];
	const [moved] = reordered.splice(from - 1, 1);
	if (moved !== undefined) reordered.splice(to - 1, 0, moved);
	return reordered;
}

function isValidDefinitionOfDoneReorder(from: number, to: number, itemCount: number): boolean {
	return (
		Number.isInteger(from) &&
		Number.isInteger(to) &&
		from >= 1 &&
		from <= itemCount &&
		to >= 1 &&
		to <= itemCount &&
		from !== to
	);
}

async function clearDefinitionOfDoneItems(context: PromptContext, items: string[]): Promise<string[]> {
	const { cancelled, response } = await promptDefinitionOfDoneAction(context, {
		type: "confirm",
		name: "confirmClearDefinitionOfDone",
		message: "Clear all Definition of Done defaults?",
		initial: false,
	});
	return !cancelled && response.confirmClearDefinitionOfDone ? [] : items;
}

async function promptWebUISettings(
	context: PromptContext,
	initial: Pick<WizardConfig, "defaultPort" | "autoOpenBrowser">,
) {
	while (true) {
		const configure = await ask(context, {
			type: "confirm",
			name: "configureWebUI",
			message: "Configure web UI settings now?",
			hint: "Port and browser auto-open",
			initial: false,
		});
		if (!configure.configureWebUI) return initial;
		let goBack = false;
		const values = await context.prompt(
			[
				{
					type: "number",
					name: "defaultPort",
					message: "Default web UI port:",
					hint: "Port number for the web interface (1-65535)",
					initial: initial.defaultPort,
					min: 1,
					max: 65535,
				},
				{
					type: "confirm",
					name: "autoOpenBrowser",
					message: "Automatically open browser when starting web UI?",
					hint: "When enabled, 'backlog web' opens your browser",
					initial: initial.autoOpenBrowser,
				},
			],
			{
				onCancel: () => {
					goBack = true;
				},
			},
		);
		if (goBack) continue;
		return {
			defaultPort: isNumber(values.defaultPort) ? values.defaultPort : initial.defaultPort,
			autoOpenBrowser: isBoolean(values.autoOpenBrowser) ? values.autoOpenBrowser : initial.autoOpenBrowser,
		};
	}
}

function initialWizardConfig(config: BacklogConfig | null | undefined): WizardConfig {
	const configured = config ? { ...DEFAULT_INIT_CONFIG, ...config } : DEFAULT_INIT_CONFIG;
	return {
		checkActiveBranches: configured.checkActiveBranches,
		remoteOperations: configured.remoteOperations,
		activeBranchDays: configured.activeBranchDays,
		bypassGitHooks: configured.bypassGitHooks,
		autoCommit: configured.autoCommit,
		zeroPaddedIds: configured.zeroPaddedIds,
		defaultEditor: configured.defaultEditor ?? process.env.EDITOR ?? process.env.VISUAL ?? resolveEditor(null),
		definitionOfDone: normalizeDefinitionOfDoneItems(config?.definitionOfDone),
		defaultPort: configured.defaultPort,
		autoOpenBrowser: configured.autoOpenBrowser,
	};
}

export async function runAdvancedConfigWizard({
	existingConfig,
	cancelMessage,
	includeClaudePrompt = false,
	promptImpl = clackPromptRunner,
	isEditorAvailable = checkEditorAvailability,
}: WizardOptions): Promise<AdvancedConfigWizardResult> {
	const initial = initialWizardConfig(existingConfig);
	const context: PromptContext = { prompt: promptImpl, onCancel: () => handlePromptCancel(cancelMessage) };
	const installShellCompletions = Boolean(
		(
			await ask(context, {
				type: "confirm",
				name: "installCompletions",
				message: "Install shell completions now?",
				hint: "Adds TAB completion support for backlog commands in your shell",
				initial: true,
			})
		).installCompletions,
	);
	const git = await promptGitSettings(context, initial);
	const zeroPaddedIds = await promptZeroPadding(context, initial.zeroPaddedIds);
	const defaultEditor = await promptEditor(context, initial.defaultEditor, isEditorAvailable);
	const definitionOfDone = await promptDefinitionOfDone(context, initial.definitionOfDone);
	const webUI = await promptWebUISettings(context, {
		defaultPort: initial.defaultPort,
		autoOpenBrowser: initial.autoOpenBrowser,
	});
	const installClaudeAgent =
		includeClaudePrompt &&
		Boolean(
			(
				await ask(context, {
					type: "confirm",
					name: "installClaudeAgent",
					message: "Install Claude Code Backlog.md agent?",
					hint: "Adds configuration under .claude/agents/",
					initial: false,
				})
			).installClaudeAgent,
		);
	return {
		config: { ...git, zeroPaddedIds, defaultEditor, definitionOfDone, ...webUI },
		installClaudeAgent,
		installShellCompletions,
	};
}
