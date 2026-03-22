import { describe, expect, it } from "bun:test";
import { shouldSkipTaskEcho } from "./shouldSkipTaskEcho";

const baseExistingTask = {
	lastSyncedAt: new Date("2026-03-20T12:00:00.000Z"),
	title: "Fix sync bug",
	description: "Keep data aligned",
	statusId: "status-1",
	priority: "high",
	assigneeId: "user-1",
	assigneeExternalId: null,
	estimate: 3,
	dueDate: new Date("2026-03-25T00:00:00.000Z"),
};

const baseIncomingTaskData = {
	title: "Fix sync bug",
	description: "Keep data aligned",
	statusId: "status-1",
	priority: "high",
	assigneeId: "user-1",
	assigneeExternalId: null,
	estimate: 3,
	dueDate: new Date("2026-03-25T00:00:00.000Z"),
};

describe("shouldSkipTaskEcho", () => {
	it("skips a recent webhook when the task already matches the incoming state", () => {
		expect(
			shouldSkipTaskEcho({
				existingTask: baseExistingTask,
				incomingTaskData: baseIncomingTaskData,
				now: new Date("2026-03-20T12:00:05.000Z").getTime(),
			}),
		).toBe(true);
	});

	it("does not skip once the echo window has expired", () => {
		expect(
			shouldSkipTaskEcho({
				existingTask: baseExistingTask,
				incomingTaskData: baseIncomingTaskData,
				now: new Date("2026-03-20T12:00:15.000Z").getTime(),
			}),
		).toBe(false);
	});

	it("does not skip when a synced field changed remotely", () => {
		expect(
			shouldSkipTaskEcho({
				existingTask: baseExistingTask,
				incomingTaskData: {
					...baseIncomingTaskData,
					description: "Changed directly in Linear",
				},
				now: new Date("2026-03-20T12:00:05.000Z").getTime(),
			}),
		).toBe(false);
	});

	it("compares due dates by date-only value", () => {
		expect(
			shouldSkipTaskEcho({
				existingTask: baseExistingTask,
				incomingTaskData: {
					...baseIncomingTaskData,
					dueDate: new Date("2026-03-25T15:30:00.000Z"),
				},
				now: new Date("2026-03-20T12:00:05.000Z").getTime(),
			}),
		).toBe(true);
	});
});
