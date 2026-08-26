import { describe, expect, test } from "bun:test";
import {
	migratePullRequestsFilterState,
	pullRequestsSearchFromFilters,
	usePullRequestsFilterStore,
} from "./pullRequestsFilterStore";

describe("usePullRequestsFilterStore.setProjectFilters", () => {
	test("does not notify subscribers when filters are unchanged", () => {
		// Views sync filters back through an effect keyed on this array, so an
		// always-fresh reference here regresses into an infinite update loop.
		const { setProjectFilters } = usePullRequestsFilterStore.getState();
		setProjectFilters(["project-1", "project-2"]);
		const before = usePullRequestsFilterStore.getState().projectFilters;
		let notifications = 0;
		const unsubscribe = usePullRequestsFilterStore.subscribe(() => {
			notifications += 1;
		});
		setProjectFilters(["project-1", "project-2"]);
		unsubscribe();
		expect(usePullRequestsFilterStore.getState().projectFilters).toBe(before);
		expect(notifications).toBe(0);
		usePullRequestsFilterStore.getState().setProjectFilters([]);
	});
});

describe("pullRequestsSearchFromFilters", () => {
	test("omits default filters", () => {
		expect(
			pullRequestsSearchFromFilters({
				search: "",
				projectFilters: [],
				authorFilter: null,
				reviewFilter: null,
				includeClosed: false,
				mergedOnly: false,
			}),
		).toEqual({});
	});

	test("serializes independent pull request filters", () => {
		expect(
			pullRequestsSearchFromFilters({
				search: "remote host",
				projectFilters: ["project-1", "project-2"],
				authorFilter: "octocat",
				reviewFilter: "changes-requested",
				includeClosed: true,
				mergedOnly: false,
			}),
		).toEqual({
			search: "remote host",
			projects: "project-1,project-2",
			author: "octocat",
			review: "changes-requested",
			state: "all",
		});
	});

	test("mergedOnly wins over includeClosed in the serialized state", () => {
		expect(
			pullRequestsSearchFromFilters({
				search: "",
				projectFilters: [],
				authorFilter: null,
				reviewFilter: null,
				includeClosed: true,
				mergedOnly: true,
			}),
		).toEqual({ state: "merged" });
	});
});

describe("migratePullRequestsFilterState", () => {
	test("moves the legacy single repository into the multi-select state", () => {
		expect(
			migratePullRequestsFilterState({
				projectFilter: "project-1",
				authorFilter: " @octocat ",
				reviewFilter: "approved",
			}),
		).toMatchObject({
			projectFilters: ["project-1"],
			authorFilter: "octocat",
			reviewFilter: "approved",
		});
	});

	test("defaults corrupt persisted values safely", () => {
		expect(
			migratePullRequestsFilterState({
				projectFilters: ["project-1", 42, "project-1"],
				authorFilter: "octocat author:someone-else",
				reviewFilter: "review:approved",
				includeClosed: "true",
				mergedOnly: "true",
			}),
		).toMatchObject({
			projectFilters: ["project-1"],
			authorFilter: null,
			reviewFilter: null,
			includeClosed: false,
			mergedOnly: false,
		});
		expect(migratePullRequestsFilterState(null)).toMatchObject({
			projectFilters: [],
			authorFilter: null,
			reviewFilter: null,
			includeClosed: false,
			mergedOnly: false,
		});
	});
});
