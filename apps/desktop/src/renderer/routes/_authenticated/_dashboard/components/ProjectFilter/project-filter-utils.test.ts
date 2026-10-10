import { describe, expect, test } from "bun:test";
import {
	areProjectFiltersEqual,
	normalizeProjectFilters,
	parseProjectFilterParam,
	resolveProjectFilterParams,
	resolvePullRequestListFilters,
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

describe("pull request list filter resolution", () => {
	test("a legacy project param filters the list when no PR is open", () => {
		expect(
			resolvePullRequestListFilters({
				projects: undefined,
				project: "project-1",
				prIsOpen: false,
			}),
		).toEqual(["project-1"]);
	});

	test("an open PR's project param never narrows the list (GH #7577)", () => {
		// Opening a PR writes `project` to identify the detail pane's repo.
		// With "all repositories" active that used to be misread as a list
		// filter, which changed every query key and refetched every page.
		expect(
			resolvePullRequestListFilters({
				projects: undefined,
				project: "project-1",
				prIsOpen: true,
			}),
		).toBeUndefined();
	});

	test("an explicit projects param wins either way", () => {
		for (const prIsOpen of [true, false]) {
			expect(
				resolvePullRequestListFilters({
					projects: "project-1,project-2",
					project: "project-3",
					prIsOpen,
				}),
			).toEqual(["project-1", "project-2"]);
		}
	});
});
