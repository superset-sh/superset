import { describe, expect, test } from "bun:test";
import { planMarkdown } from "./planMarkdown";

describe("planMarkdown", () => {
	test("stable blocks keep byte-identical keys and content as text streams in", () => {
		const first = planMarkdown("# Title\n\nParagraph one.\n\nParagraph tw");
		const second = planMarkdown(
			"# Title\n\nParagraph one.\n\nParagraph two.\n\nParagraph three",
		);

		expect(first.stable.length).toBeGreaterThan(0);
		for (const [index, block] of first.stable.entries()) {
			expect(second.stable[index]).toEqual(block);
		}
		expect(second.tail).toBe("Paragraph three");
	});

	test("an open fence marks the tail as plain and closing it releases the block", () => {
		const open = planMarkdown("Intro\n\n```ts\nconst a = 1;\n");
		expect(open.tailFenceOpen).toBe(true);
		expect(open.tail).toContain("const a = 1;");

		const closed = planMarkdown("Intro\n\n```ts\nconst a = 1;\n```\n\nAfter");
		expect(closed.tailFenceOpen).toBe(false);
		expect(closed.tail).toBe("After");
		expect(
			closed.stable.some((entry) => entry.block.includes("const a = 1;")),
		).toBe(true);
	});

	test("empty text renders nothing", () => {
		expect(planMarkdown("")).toEqual({
			stable: [],
			tail: null,
			tailFenceOpen: false,
		});
	});
});
