import { describe, expect, test } from "bun:test";
import { diffTaskActivity } from "./activity";

const base = {
	title: "Fix the sidebar",
	description: "First draft",
	statusId: "status-todo",
	priority: "none" as const,
	assigneeId: null,
};

describe("diffTaskActivity", () => {
	test("records nothing when no tracked field moved", () => {
		expect(diffTaskActivity(base, { ...base })).toEqual([]);
	});

	test("records one change per field that moved", () => {
		expect(
			diffTaskActivity(base, {
				...base,
				statusId: "status-done",
				assigneeId: "user-1",
			}),
		).toEqual([
			{ fromStatusId: "status-todo", toStatusId: "status-done" },
			{ fromAssigneeId: null, toAssigneeId: "user-1" },
		]);
	});

	test("records that the description was edited, not its contents", () => {
		expect(
			diffTaskActivity(base, { ...base, description: "Second draft" }),
		).toEqual([{ descriptionEdited: true }]);
	});
});
