import { describe, expect, test } from "bun:test";
import { shouldKeepWorkItemsPlaceholder } from "./shouldKeepWorkItemsPlaceholder";

const key = (targetKey: string) => [
	"pullRequests",
	"searchPullRequests",
	targetKey,
	"",
];

describe("shouldKeepWorkItemsPlaceholder", () => {
	test("keeps rows while filtering within one project and host", () => {
		expect(
			shouldKeepWorkItemsPlaceholder(
				key("host-a\0project-1"),
				"host-a\0project-1",
			),
		).toBe(true);
	});

	test("drops stale rows when the project changes", () => {
		expect(
			shouldKeepWorkItemsPlaceholder(
				key("host-a\0project-1"),
				"host-a\0project-2",
			),
		).toBe(false);
	});

	test("drops stale rows when routing moves to another host", () => {
		expect(
			shouldKeepWorkItemsPlaceholder(
				key("host-a\0project-1"),
				"host-b\0project-1",
			),
		).toBe(false);
	});
});
