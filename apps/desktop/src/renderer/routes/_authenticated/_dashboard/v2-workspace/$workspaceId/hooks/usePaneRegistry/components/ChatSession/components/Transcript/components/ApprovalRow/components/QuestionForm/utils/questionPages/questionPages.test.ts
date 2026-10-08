import { describe, expect, it } from "bun:test";
import type { FormField } from "@superset/chat/protocol";
import { isInvalidNumber, questionPages } from "./questionPages";

const choice = (id: string): FormField => ({
	id,
	input: "single",
	options: [{ value: "a", label: "a" }],
});
const text = (id: string): FormField => ({ id, input: "text" });

describe("questionPages", () => {
	it("pairs each choice with the text field that follows it", () => {
		const pages = questionPages([
			choice("q0"),
			text("q0_custom"),
			choice("q1"),
			text("q1_custom"),
			text("note"),
		]);
		expect(pages.map((page) => [page.field.id, page.other?.id])).toEqual([
			["q0", "q0_custom"],
			["q1", "q1_custom"],
			["note", undefined],
		]);
	});

	it("keeps a generic text field on its own page", () => {
		const pages = questionPages([choice("priority"), text("notes")]);
		expect(pages.map((page) => [page.field.id, page.other?.id])).toEqual([
			["priority", undefined],
			["notes", undefined],
		]);
	});

	it("flags a decimal in a whole-number field but not an empty one", () => {
		const integer: FormField = { id: "count", input: "integer" };
		const number: FormField = { id: "ratio", input: "number" };
		expect(isInvalidNumber(integer, "3.9")).toBe(true);
		expect(isInvalidNumber(integer, "4")).toBe(false);
		expect(isInvalidNumber(integer, "")).toBe(false);
		expect(isInvalidNumber(number, "3.9")).toBe(false);
	});
});
