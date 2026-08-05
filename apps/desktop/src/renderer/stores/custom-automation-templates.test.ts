import { describe, expect, it } from "bun:test";
import {
	type CustomAutomationTemplate,
	upsertCustomTemplate,
} from "./custom-automation-templates";

const template = (
	overrides: Partial<CustomAutomationTemplate>,
): CustomAutomationTemplate => ({
	id: "existing",
	emoji: "📌",
	description: "prompt",
	name: "name",
	prompt: "prompt",
	savedAt: 1,
	...overrides,
});

describe("upsertCustomTemplate", () => {
	it("prepends a new template with trimmed fields", () => {
		const result = upsertCustomTemplate(
			[template({})],
			{
				name: "  Daily digest  ",
				prompt: "  Do the thing  ",
				rrule: "FREQ=DAILY",
			},
			"new-id",
			42,
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			id: "new-id",
			name: "Daily digest",
			prompt: "Do the thing",
			description: "Do the thing",
			rrule: "FREQ=DAILY",
			savedAt: 42,
		});
	});

	it("ignores entries with an empty name or prompt", () => {
		const existing = [template({})];
		expect(
			upsertCustomTemplate(existing, { name: " ", prompt: "p" }, "a", 1),
		).toBe(existing);
		expect(
			upsertCustomTemplate(existing, { name: "n", prompt: " " }, "a", 1),
		).toBe(existing);
	});

	it("replaces an identical name+prompt instead of duplicating", () => {
		const result = upsertCustomTemplate(
			[template({ id: "old", name: "Same", prompt: "Same prompt" })],
			{ name: "Same", prompt: "Same prompt" },
			"new-id",
			42,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("new-id");
	});

	it("caps the list at 50 entries", () => {
		const existing = Array.from({ length: 50 }, (_, i) =>
			template({ id: `t-${i}`, name: `Template ${i}`, prompt: `Prompt ${i}` }),
		);

		const result = upsertCustomTemplate(
			existing,
			{ name: "Newest", prompt: "Newest prompt" },
			"new-id",
			42,
		);

		expect(result).toHaveLength(50);
		expect(result[0]?.id).toBe("new-id");
		expect(result.at(-1)?.id).toBe("t-48");
	});
});
