function scanYamlScalar(value: string, onCharacter: (character: string, index: number, quoted: boolean) => void): void {
	let quote: '"' | "'" | null = null;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index] as string;
		if (quote) {
			if (character === quote && value[index - 1] !== "\\") quote = null;
			else onCharacter(character, index, true);
		} else if (character === '"' || character === "'") quote = character;
		else onCharacter(character, index, false);
	}
}

function stripYamlComment(value: string): string {
	let commentAt = -1;
	scanYamlScalar(value, (character, index, quoted) => {
		if (!quoted && character === "#" && commentAt === -1) commentAt = index;
	});
	return commentAt === -1 ? value : value.slice(0, commentAt).trimEnd();
}

function parseYamlValue(value: string): string {
	const trimmed = stripYamlComment(value).trim();
	const singleQuoted = trimmed.match(/^'(.*)'$/);
	if (singleQuoted?.[1] !== undefined) return singleQuoted[1].replace(/''/g, "'");
	const doubleQuoted = trimmed.match(/^"(.*)"$/);
	return doubleQuoted?.[1] !== undefined ? doubleQuoted[1].replace(/\\"/g, '"').replace(/\\'/g, "'") : trimmed;
}

function parseInlineArray(value: string): string[] {
	const items: string[] = [];
	let current = "";
	scanYamlScalar(value, (character, _index, quoted) => {
		if (character === "," && !quoted) {
			const item = current.trim().replace(/\\(['"])/g, "$1");
			if (item) items.push(item);
			current = "";
		} else current += character;
	});
	const item = current.trim().replace(/\\(['"])/g, "$1");
	if (item) items.push(item);
	return items;
}

function findMilestoneDeclaration(lines: string[]): { index: number; indent: number; value: string } | null {
	for (const [index, line] of lines.entries()) {
		const match = (line ?? "").match(/^(\s*)milestones\s*:\s*(.*)$/);
		if (match) return { index, indent: (match[1] ?? "").length, value: stripYamlComment(match[2] ?? "").trim() };
	}
	return null;
}

function parseInlineMilestones(value: string, followingLines: string[]): string[] | null {
	if (!value.startsWith("[")) return null;
	let combined = value;
	for (const line of followingLines) {
		if (combined.endsWith("]")) break;
		combined += stripYamlComment(line).trim();
	}
	const open = combined.indexOf("[");
	const close = combined.lastIndexOf("]");
	return combined.endsWith("]") && open !== -1 && close > open
		? parseInlineArray(combined.slice(open + 1, close))
				.map(parseYamlValue)
				.filter(Boolean)
		: null;
}

function parseBlockMilestones(lines: string[], indent: number): string[] {
	const values: string[] = [];
	for (const line of lines) {
		if (!line.trim()) continue;
		if ((line.match(/^\s*/)?.[0].length ?? 0) <= indent) break;
		if (!line.trim().startsWith("-")) continue;
		const value = parseYamlValue(line.trim().slice(1));
		if (value) values.push(value);
	}
	return values;
}

export function extractLegacyMilestones(content: string): string[] {
	const lines = content.split("\n");
	const declaration = findMilestoneDeclaration(lines);
	if (!declaration) return [];
	const followingLines = lines.slice(declaration.index + 1);
	return (
		parseInlineMilestones(declaration.value, followingLines) ??
		(declaration.value
			? [parseYamlValue(declaration.value)].filter(Boolean)
			: parseBlockMilestones(followingLines, declaration.indent))
	);
}
