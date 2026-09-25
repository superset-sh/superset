import { describe, expect, test } from "bun:test";
import {
	areProjectFiltersEqual,
	normalizeProjectFilters,
	parseProjectFilterParam,
	resolveProjectFilterParams,
	serializeProjectFilters,
} from "./project-filter-utils";

describe("project filter serialization", () => {
	test("uses an omitted parameter for all repositories", () => {
		expect(parseProjectFilterParam(undefined)).toEqual([]);
		expect(serializeProjectFilters([])).toBeUndefined();
	});

	test("round trips multiple repository ids", () => {
		const projectIds = ["project-1", "project-2"];
		expect(
			parseProjectFilterParam(serializeProjectFilters(projectIds)),
		).toEqual(projectIds);
	});

	test("drops invalid and duplicate persisted values", () => {
		expect(
			normalizeProjectFilters([" project-1 ", null, "project-1", " "]),
		).toEqual(["project-1"]);
	});

	test("compares filters by content and order", () => {
		expect(areProjectFiltersEqual([], [])).toBe(true);
		expect(
			areProjectFiltersEqual(
				["project-1", "project-2"],
				["project-1", "project-2"],
			),
		).toBe(true);
		expect(
			areProjectFiltersEqual(
				["project-1", "project-2"],
				["project-2", "project-1"],
			),
		).toBe(false);
		expect(areProjectFiltersEqual(["project-1"], [])).toBe(false);
	});

	test("resolves multi-select, legacy, and caller-specific empty values", () => {
		expect(
			resolveProjectFilterParams("project-1, project-2", "legacy", []),
		).toEqual(["project-1", "project-2"]);
		expect(resolveProjectFilterParams(undefined, " legacy ", [])).toEqual([
			"legacy",
		]);
		expect(
			resolveProjectFilterParams(undefined, undefined, undefined),
		).toBeUndefined();
	});
});
