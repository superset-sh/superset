import { describe, expect, test } from "bun:test";
import { shouldKeepWorkItemsPlaceholder } from "./shouldKeepWorkItemsPlaceholder";

describe("shouldKeepWorkItemsPlaceholder", () => {
	test("keeps rows while filtering within one project and host", () => {
		expect(
			shouldKeepWorkItemsPlaceholder(
				["pullRequests", "searchPullRequests", "project-1", "host-a"],
				"project-1",
				"host-a",
			),
		).toBe(true);
	});

	test("drops stale rows when the project changes", () => {
		expect(
			shouldKeepWorkItemsPlaceholder(
				["pullRequests", "searchPullRequests", "project-1", "host-a"],
				"project-2",
				"host-a",
			),
		).toBe(false);
	});

	test("drops stale rows when routing moves to another host", () => {
		expect(
			shouldKeepWorkItemsPlaceholder(
				["pullRequests", "searchPullRequests", "project-1", "host-a"],
				"project-1",
				"host-b",
			),
		).toBe(false);
	});
});
