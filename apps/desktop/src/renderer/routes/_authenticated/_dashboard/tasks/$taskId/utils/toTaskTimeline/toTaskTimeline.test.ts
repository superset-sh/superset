import { describe, expect, test } from "bun:test";
import type { TaskTimeline } from "../../types";
import { toTaskTimeline } from "./toTaskTimeline";

const satya = { userId: "satya", name: "Satya Patel", image: null };
const at = (minute: number, second = 0) =>
	new Date(Date.UTC(2026, 8, 28, 12, minute, second));
const todo = {
	id: "todo",
	name: "Todo",
	type: "unstarted",
	color: "#999",
	progressPercent: null,
};
const doing = { ...todo, id: "doing", name: "In progress", type: "started" };
const done = { ...todo, id: "done", name: "Done", type: "completed" };

const empty: TaskTimeline = {
	created: { at: at(0), actor: satya, importedFrom: null },
	changes: [],
	workspaceLinks: [],
	comments: [],
};

const change = (
	id: string,
	when: Date,
	fields: Partial<TaskTimeline["changes"][number]>,
): TaskTimeline["changes"][number] => ({
	id,
	at: when,
	actor: satya,
	title: null,
	descriptionEdited: false,
	addedLabels: [],
	removedLabels: [],
	status: null,
	priority: null,
	assignee: null,
	project: null,
	...fields,
});

const comment = (
	id: string,
	when: Date,
	parentCommentId: string | null = null,
): TaskTimeline["comments"][number] => ({
	id,
	at: when,
	editedAt: null,
	parentCommentId,
	body: id,
	author: satya,
});

const kinds = (timeline: TaskTimeline) =>
	toTaskTimeline(timeline).map((item) =>
		item.kind === "event" ? item.event.kind : `thread:${item.thread.root.id}`,
	);

describe("toTaskTimeline", () => {
	test("orders events and threads by when they happened", () => {
		expect(
			kinds({
				...empty,
				changes: [
					change("status", at(5), { status: { from: todo, to: doing } }),
				],
				comments: [comment("first", at(3)), comment("reply", at(9), "first")],
			}),
		).toEqual(["created", "thread:first", "status"]);
	});

	test("folds quick changes by one person into one, keeping where it started", () => {
		const [, merged] = toTaskTimeline({
			...empty,
			changes: [
				change("a", at(5), { status: { from: todo, to: doing } }),
				change("b", at(5, 30), { status: { from: doing, to: done } }),
			],
		});
		expect(merged).toMatchObject({
			kind: "event",
			event: { kind: "status", from: { id: "todo" }, to: { id: "done" } },
		});
	});

	test("drops a change undone moments later", () => {
		expect(
			kinds({
				...empty,
				changes: [
					change("a", at(5), { status: { from: todo, to: doing } }),
					change("b", at(5, 20), { status: { from: doing, to: todo } }),
				],
			}),
		).toEqual(["created"]);
	});

	test("groups replies under their comment", () => {
		const items = toTaskTimeline({
			...empty,
			comments: [
				comment("root", at(1)),
				comment("other", at(2)),
				comment("reply", at(3), "root"),
			],
		});
		const threads = items.flatMap((item) =>
			item.kind === "thread" ? [item.thread] : [],
		);
		expect(
			threads.map((thread) => [
				thread.root.id,
				thread.replies.map((reply) => reply.id),
			]),
		).toEqual([
			["root", ["reply"]],
			["other", []],
		]);
	});

	test("folds a session of description edits into one, at the latest edit", () => {
		const items = toTaskTimeline({
			...empty,
			changes: [
				change("d1", at(1), { descriptionEdited: true }),
				change("d2", at(9), { descriptionEdited: true }),
				change("d3", at(40), { descriptionEdited: true }),
			],
		});
		expect(
			items.flatMap((item) =>
				item.kind === "event" ? [`${item.event.kind}:${item.event.id}`] : [],
			),
		).toEqual([
			"created:created",
			"description_edited:d2",
			"description_edited:d3",
		]);
	});
});
