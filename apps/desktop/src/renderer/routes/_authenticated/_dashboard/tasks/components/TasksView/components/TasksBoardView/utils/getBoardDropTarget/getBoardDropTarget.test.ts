import { describe, expect, test } from "bun:test";
import { getBoardDropTarget } from "./getBoardDropTarget";

const todo = { id: "t-todo", statusId: "todo" };
const todo2 = { id: "t-todo-2", statusId: "todo" };
const done = { id: "t-done", statusId: "done" };
const tasks = [todo, todo2, done];

describe("getBoardDropTarget", () => {
	test("returns noop when there is no over target", () => {
		expect(
			getBoardDropTarget({
				activeTaskId: todo.id,
				tasks,
				overData: null,
			}),
		).toEqual({ type: "noop" });
	});

	test("moves task to the column status when dropped on a column", () => {
		expect(
			getBoardDropTarget({
				activeTaskId: todo.id,
				tasks,
				overData: { type: "column", statusId: "done" },
			}),
		).toEqual({
			type: "moveToStatus",
			taskId: todo.id,
			targetStatusId: "done",
		});
	});

	test("moves task to the target task's status when dropped on another task", () => {
		expect(
			getBoardDropTarget({
				activeTaskId: todo.id,
				tasks,
				overData: { type: "task", task: done },
			}),
		).toEqual({
			type: "moveToStatus",
			taskId: todo.id,
			targetStatusId: "done",
		});
	});

	test("returns noop when the active task is not found", () => {
		expect(
			getBoardDropTarget({
				activeTaskId: "missing",
				tasks,
				overData: { type: "column", statusId: "done" },
			}),
		).toEqual({ type: "noop" });
	});

	// Repro for issue #4714 — "Drag and drop from any status".
	//
	// The Kanban board only emits an action when the source and target columns
	// differ. Dropping a task onto another task already in the same status (or
	// onto the same status column) is silently ignored, so cards in any given
	// status appear non-rearrangeable. This test pins that behavior so a future
	// fix that adds within-status reordering must update it.
	test("issue #4714: dropping on a task in the same status is a noop", () => {
		expect(
			getBoardDropTarget({
				activeTaskId: todo.id,
				tasks,
				overData: { type: "task", task: todo2 },
			}),
		).toEqual({ type: "noop" });

		expect(
			getBoardDropTarget({
				activeTaskId: todo.id,
				tasks,
				overData: { type: "column", statusId: "todo" },
			}),
		).toEqual({ type: "noop" });
	});
});
