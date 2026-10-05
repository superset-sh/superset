import { describe, expect, test } from "bun:test";
import { toTimelineEntries } from "./toTimelineEntries";

type Row = Parameters<typeof toTimelineEntries>[0][number];

const at = new Date("2026-09-26T12:00:00Z");
const kiet = { userId: "kiet", name: "Kiet Ho", image: null };
const task = {
	id: "t1",
	slug: "SUPER-1",
	externalProvider: null,
	externalKey: null,
	title: "A task",
	status: null,
};

function row(overrides: Partial<Row>): Row {
	return {
		id: "e1",
		at,
		actor: { kind: "user", person: kiet },
		event: null,
		fromName: null,
		toName: null,
		fromVisibility: null,
		toVisibility: null,
		fromProject: null,
		toProject: null,
		addedLabels: [],
		removedLabels: [],
		linkedTask: null,
		unlinkedTask: null,
		prUrl: null,
		page: null,
		suggestedBy: null,
		suggestionSource: null,
		...overrides,
	};
}

describe("toTimelineEntries", () => {
	test("events map to their own kinds", () => {
		expect(
			toTimelineEntries([
				row({ event: "created" }),
				row({ id: "e2", event: "description_edited" }),
			]).map((entry) => entry.kind),
		).toEqual(["created", "description_edited"]);
	});

	test("a field change maps by the field it touched", () => {
		const [renamed, linked, project] = toTimelineEntries([
			row({ fromName: "old", toName: "new" }),
			row({ id: "e2", linkedTask: task, suggestedBy: kiet }),
			row({
				id: "e3",
				fromProject: { id: "p", name: "P", icon: null, color: null },
			}),
		]);
		expect(renamed).toMatchObject({ kind: "renamed", from: "old", to: "new" });
		expect(linked).toMatchObject({ kind: "task_linked", suggestedBy: kiet });
		expect(project).toMatchObject({ kind: "project_changed", project: null });
	});

	test("each label in one change becomes its own entry", () => {
		const entries = toTimelineEntries([
			row({
				addedLabels: [{ id: "a", name: "perf", color: null }],
				removedLabels: [{ id: "b", name: "old", color: null }],
			}),
		]);
		expect(entries.map((entry) => [entry.kind, entry.id])).toEqual([
			["label_added", "e1:a"],
			["label_removed", "e1:b"],
		]);
	});

	test("rows the page can't show yet are skipped", () => {
		expect(
			toTimelineEntries([row({ event: "run_finished" }), row({ id: "e3" })]),
		).toEqual([]);
	});

	describe("collapsing", () => {
		const later = (seconds: number) => new Date(at.getTime() + seconds * 1000);
		const avi = { userId: "avi", name: "Avi Peltz", image: null };
		const label = { id: "l1", name: "bug", color: "#ef4444" };

		test("renames a moment apart become one rename from the first name", () => {
			const entries = toTimelineEntries([
				row({ id: "e1", fromName: "a", toName: "b" }),
				row({ id: "e2", at: later(20), fromName: "b", toName: "c" }),
			]);
			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({ kind: "renamed", from: "a", to: "c" });
		});

		test("a rename undone a moment later disappears", () => {
			expect(
				toTimelineEntries([
					row({ id: "e1", fromName: "a", toName: "b" }),
					row({ id: "e2", at: later(20), fromName: "b", toName: "a" }),
				]),
			).toEqual([]);
		});

		test("changes more than a minute apart stay separate", () => {
			expect(
				toTimelineEntries([
					row({ id: "e1", fromName: "a", toName: "b" }),
					row({ id: "e2", at: later(61), fromName: "b", toName: "c" }),
				]),
			).toHaveLength(2);
		});

		test("different people's changes stay separate", () => {
			expect(
				toTimelineEntries([
					row({ id: "e1", fromName: "a", toName: "b" }),
					row({
						id: "e2",
						at: later(5),
						actor: { kind: "user", person: avi },
						fromName: "b",
						toName: "c",
					}),
				]),
			).toHaveLength(2);
		});

		test("a label added then removed a moment later disappears", () => {
			expect(
				toTimelineEntries([
					row({ id: "e1", addedLabels: [label] }),
					row({ id: "e2", at: later(10), removedLabels: [label] }),
				]),
			).toEqual([]);
		});

		test("a project set and cleared a moment later disappears", () => {
			const project = { id: "p", name: "P", icon: null, color: null };
			expect(
				toTimelineEntries([
					row({ id: "e1", toProject: project }),
					row({ id: "e2", at: later(10), fromProject: project }),
				]),
			).toEqual([]);
		});
	});
});
