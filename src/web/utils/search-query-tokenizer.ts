export interface SearchQueryToken {
	raw: string;
	value: string;
	malformed: boolean;
}

function skipWhitespace(input: string, index: number) {
	let next = index;
	while (next < input.length && /\s/.test(input[next] ?? "")) next += 1;
	return next;
}

function readToken(input: string, start: number) {
	let index = start;
	let value = "";
	while (index < input.length && !/\s/.test(input[index] ?? "")) {
		if (input[index] !== '"') {
			value += input[index];
			index += 1;
			continue;
		}
		const quotedStart = ++index;
		while (index < input.length && input[index] !== '"') index += 1;
		if (index >= input.length) return { index: input.length, value: value + input.slice(quotedStart), malformed: true };
		value += input.slice(quotedStart, index++);
	}
	return { index, value, malformed: false };
}

export function tokenizeSearchQuery(input: string): SearchQueryToken[] {
	const tokens: SearchQueryToken[] = [];
	for (let index = skipWhitespace(input, 0); index < input.length; index = skipWhitespace(input, index)) {
		const start = index;
		const token = readToken(input, start);
		tokens.push({ raw: input.slice(start, token.index), value: token.value, malformed: token.malformed });
		index = token.index;
	}
	return tokens;
}
