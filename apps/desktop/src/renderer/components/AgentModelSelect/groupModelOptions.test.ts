import { describe, expect, it } from "bun:test";
import { groupModelOptions } from "./groupModelOptions";

describe("groupModelOptions", () => {
	it("keeps an ungrouped catalog as one headerless block", () => {
		const groups = groupModelOptions([
			{ id: "low", label: "Low" },
			{ id: "high", label: "High" },
		]);
		expect(groups).toEqual([
			{
				label: null,
				options: [
					{ id: "low", label: "Low" },
					{ id: "high", label: "High" },
				],
			},
		]);
	});

	it("splits a catalog into its sections in catalog order", () => {
		const groups = groupModelOptions([
			{ id: "opus", label: "Opus", group: "Latest" },
			{ id: "sonnet", label: "Sonnet", group: "Latest" },
			{ id: "claude-opus-4-8", label: "Opus 4.8", group: "Pinned releases" },
		]);
		expect(groups.map((g) => g.label)).toEqual(["Latest", "Pinned releases"]);
		expect(groups[0]?.options.map((o) => o.id)).toEqual(["opus", "sonnet"]);
		expect(groups[1]?.options.map((o) => o.id)).toEqual(["claude-opus-4-8"]);
	});

	it("does not reorder a catalog that returns to an earlier header", () => {
		const groups = groupModelOptions([
			{ id: "a", label: "A", group: "One" },
			{ id: "b", label: "B", group: "Two" },
			{ id: "c", label: "C", group: "One" },
		]);
		expect(groups.map((g) => g.label)).toEqual(["One", "Two", "One"]);
		expect(groups.map((g) => g.options.map((o) => o.id))).toEqual([
			["a"],
			["b"],
			["c"],
		]);
	});

	it("renders every option exactly once", () => {
		const models = [
			{ id: "a", label: "A", group: "One" },
			{ id: "b", label: "B" },
			{ id: "c", label: "C", group: "Two" },
		];
		expect(groupModelOptions(models).flatMap((g) => g.options)).toEqual(models);
	});
});
