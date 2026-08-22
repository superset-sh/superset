import { describe, expect, it } from "bun:test";
import {
	buildNextSlashInput,
	buildParamFields,
	parseSlashInput,
	resolveSlashCommandDefinition,
} from "./slash-command-preview.model";

describe("slash-command-preview model", () => {
	it("derives positional fields from argumentHint", () => {
		const parsed = parseSlashInput("/model");
		const fields = buildParamFields({
			argumentHint: "[<model-id-or-name>]",
			unresolvedFieldKeys: [],
			parsed,
		});

		expect(fields).toHaveLength(1);
		expect(fields[0]?.kind).toBe("positional");
		expect(fields[0]?.label).toBe("model id or name");
		expect(fields[0]?.positionalIndex).toBe(0);
		expect(fields[0]?.required).toBe(false);
	});

	it("keeps parsed named fields even after they resolve", () => {
		const parsed = parseSlashInput(
			'/refactor src goal="ship it" constraints="no api"',
		);
		const fields = buildParamFields({
			argumentHint: "<scope> [goal=...]",
			unresolvedFieldKeys: [],
			parsed,
		});

		expect(fields.some((field) => field.id === "named:GOAL")).toBe(true);
		expect(fields.some((field) => field.id === "named:CONSTRAINTS")).toBe(true);
	});

	it("preserves spaces while updating a named field", () => {
		const parsed = parseSlashInput("/refactor src goal=cleanup");
		expect(parsed).not.toBeNull();
		const next = buildNextSlashInput(
			parsed as NonNullable<typeof parsed>,
			{
				id: "named:GOAL",
				kind: "named",
				label: "goal",
				required: false,
				namedKeyUpper: "GOAL",
			},
			"improve readability",
		);

		expect(next).toBe('/refactor src goal="improve readability"');
	});

	it("resolves command definitions by alias", () => {
		const command = resolveSlashCommandDefinition(
			[
				{
					name: "new",
					aliases: ["clear"],
					description: "Start a fresh chat session.",
					argumentHint: "",
				},
			],
			"clear",
		);

		expect(command?.name).toBe("new");
	});
});
