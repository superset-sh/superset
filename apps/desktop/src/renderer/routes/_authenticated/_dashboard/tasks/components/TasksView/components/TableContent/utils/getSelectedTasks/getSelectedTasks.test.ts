import { describe, expect, test } from "bun:test";
import type { TaskWithStatus } from "../../../../hooks/useTasksData";
import { getSelectedTasks } from "./getSelectedTasks";

function createTask(id: string, title = `Task ${id}`): TaskWithStatus {
	return {
		id,
		title,
		slug: `TASK-${id}`,
		organizationId: "org-1",
		statusId: "status-1",
		description: null,
		priority: "none",
		estimate: null,
		dueDate: null,
		labels: [],
		assigneeId: null,
		assigneeExternalId: null,
		assigneeDisplayName: null,
		assigneeAvatarUrl: null,
		branch: null,
		prUrl: null,
		externalProvider: null,
		externalId: null,
		externalKey: null,
		externalUrl: null,
		lastSyncedAt: null,
		syncError: null,
		creatorId: "user-1",
		startedAt: null,
		completedAt: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		status: {
			id: "status-1",
			name: "Todo",
			type: "unstarted",
			color: "#000000",
			position: 0,
			progressPercent: null,
			organizationId: "org-1",
			externalProvider: null,
			externalId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		assignee: null,
	};
}

describe("getSelectedTasks", () => {
	test("deduplicates repeated grouped rows for the same task", () => {
		const task = createTask("task-1");

		const selectedTasks = getSelectedTasks(
			[
				{ id: task.id, original: task },
				{ id: task.id, original: task },
			],
			{ [task.id]: true },
		);

		expect(selectedTasks).toHaveLength(1);
		expect(selectedTasks[0]?.id).toBe(task.id);
	});

	test("keeps visible row order for selected tasks", () => {
		const firstTask = createTask("task-1");
		const secondTask = createTask("task-2");
		const thirdTask = createTask("task-3");

		const selectedTasks = getSelectedTasks(
			[
				{ id: firstTask.id, original: firstTask },
				{ id: secondTask.id, original: secondTask },
				{ id: thirdTask.id, original: thirdTask },
			],
			{
				[firstTask.id]: true,
				[thirdTask.id]: true,
			},
		);

		expect(selectedTasks.map((task) => task.id)).toEqual([
			firstTask.id,
			thirdTask.id,
		]);
	});
});
