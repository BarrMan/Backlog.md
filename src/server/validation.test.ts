import { describe, expect, it } from "bun:test";
import { normalizeAcceptanceCriteriaItems, parseTaskUpdate } from "./validation.ts";

describe("acceptance criteria normalization", () => {
	it("uses the same normalized values for create and update inputs", () => {
		const items = [{ text: "  First criterion  ", checked: 1 }, { text: "  " }, null];
		const expected = [{ text: "First criterion", checked: true }];

		expect(normalizeAcceptanceCriteriaItems(items)).toEqual(expected);
		expect(parseTaskUpdate({ acceptanceCriteriaItems: items })).toEqual({
			value: { acceptanceCriteria: expected },
		});
	});
});
