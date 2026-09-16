import { expect, test } from "bun:test";
import { splitMarkdown } from "./split-markdown";

test("long replies fit Slack's limit without losing text", () => {
	for (const text of [
		"short reply",
		"a".repeat(24_001),
		`${"a".repeat(11_999)}🙂end`,
		`${"a".repeat(8_000)}\n${"b".repeat(8_000)}`,
	]) {
		const parts = splitMarkdown(text);
		expect(parts.join("")).toBe(text);
		for (const part of parts) {
			expect(part.length).toBeLessThanOrEqual(12_000);
			expect(part.isWellFormed()).toBe(true);
		}
	}
});
