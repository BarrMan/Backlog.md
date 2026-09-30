/* Code path detection and styling utilities */

/**
 * Regex patterns for detecting code paths in backticks
 */
export const CODE_PATH_PATTERNS = {
	// Matches `src/cli.ts`, `package.json`, `/full/path/file.ts`
	BACKTICKED_PATH: /`([^`]+)`/g,
	// Matches file extensions
	FILE_EXTENSION: /\.[a-zA-Z0-9]+$/,
	// Matches path separators
	PATH_SEPARATOR: /[/\\]/,
} as const;

/**
 * Detect if a backticked string is likely a file path
 */
export function isCodePath(content: string): boolean {
	// Has file extension OR contains path separator
	return CODE_PATH_PATTERNS.FILE_EXTENSION.test(content) || CODE_PATH_PATTERNS.PATH_SEPARATOR.test(content);
}

/**
 * Extract all code paths from text
 */
export function extractCodePaths(text: string): string[] {
	const matches = text.match(CODE_PATH_PATTERNS.BACKTICKED_PATH);
	if (!matches) return [];

	return matches
		.map((match) => match.slice(1, -1)) // Remove backticks
		.filter(isCodePath);
}

/**
 * Style a code path for blessed display
 */
export function styleCodePath(path: string): string {
	return `{gray-fg}\`${path}\`{/gray-fg}`;
}

function transformCodePathLine(line: string): string[] {
	const codePaths = extractCodePaths(line);
	if (codePaths.length === 0) return [line];

	const lineWithoutPaths = line.replace(/`[^`]+`/g, "").trim();
	if (codePaths.length === 1 && lineWithoutPaths.length < 10) {
		return [codePaths.reduce((content, path) => content.replace(`\`${path}\``, styleCodePath(path)), line)];
	}

	let content = line;
	const extracted: string[] = [];
	for (const path of codePaths) {
		const backticked = `\`${path}\``;
		if (!content.includes(backticked)) continue;
		content = content.replace(backticked, " ").replace(/\s+/g, " ").trim();
		extracted.push(styleCodePath(path));
	}
	return [...(content ? [content] : []), ...extracted];
}

/**
 * Transform text to style code paths and place them on separate lines
 */
export function transformCodePaths(text: string): string {
	if (!text) return "";
	return text.split("\n").flatMap(transformCodePathLine).join("\n");
}

/**
 * Simple styling for plain text (without blessed tags)
 */
export function transformCodePathsPlain(text: string): string {
	if (!text) return "";

	return text.replace(CODE_PATH_PATTERNS.BACKTICKED_PATH, (match, path) => {
		if (isCodePath(path)) {
			return `\`${path}\``;
		}
		return match;
	});
}
