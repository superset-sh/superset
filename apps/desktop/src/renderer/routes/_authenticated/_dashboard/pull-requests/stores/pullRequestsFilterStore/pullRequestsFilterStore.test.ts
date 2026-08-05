import { describe, expect, test } from "bun:test";
import { pullRequestsSearchFromFilters } from "./pullRequestsFilterStore";

describe("pullRequestsSearchFromFilters", () => {
	test("omits default filters", () => {
		expect(
			pullRequestsSearchFromFilters({
				search: "",
				projectFilter: null,
				includeClosed: false,
			}),
		).toEqual({});
	});

	test("serializes independent pull request filters", () => {
		expect(
			pullRequestsSearchFromFilters({
				search: "remote host",
				projectFilter: "project-1",
				includeClosed: true,
			}),
		).toEqual({
			search: "remote host",
			project: "project-1",
			state: "all",
		});
	});
});
