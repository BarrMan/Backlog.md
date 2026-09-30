const TYPE_BADGE_PALETTES = [
	"bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
	"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
	"bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
	"bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
	"bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
	"bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
	"bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
	"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
] as const;
const COMMON_TYPE_PALETTE_INDEX: Record<string, number> = {
	bug: 0,
	feature: 1,
	enhancement: 2,
	task: 3,
	chore: 4,
	docs: 5,
	spike: 6,
};

function hashType(type: string) {
	return [...type].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
}

export function getTaskTypePalette(taskType: string, availableTypes?: string[]) {
	const normalized = taskType.trim().toLowerCase();
	const knownIndex = COMMON_TYPE_PALETTE_INDEX[normalized];
	if (knownIndex !== undefined) return TYPE_BADGE_PALETTES[knownIndex];
	const configuredTypes = [...new Set((availableTypes ?? []).map((type) => type.trim().toLowerCase()).filter(Boolean))];
	const usedKnownIndices = new Set(
		configuredTypes
			.map((type) => COMMON_TYPE_PALETTE_INDEX[type])
			.filter((index): index is number => index !== undefined),
	);
	const customTypes = configuredTypes.filter((type) => COMMON_TYPE_PALETTE_INDEX[type] === undefined);
	const availableIndices = TYPE_BADGE_PALETTES.map((_, index) => index).filter((index) => !usedKnownIndices.has(index));
	const customIndex = customTypes.indexOf(normalized);
	const configuredPaletteIndex = availableIndices[customIndex % availableIndices.length];
	const paletteIndex =
		customIndex >= 0 && configuredPaletteIndex !== undefined
			? configuredPaletteIndex
			: hashType(normalized) % TYPE_BADGE_PALETTES.length;
	return TYPE_BADGE_PALETTES[paletteIndex] ?? TYPE_BADGE_PALETTES[0];
}
