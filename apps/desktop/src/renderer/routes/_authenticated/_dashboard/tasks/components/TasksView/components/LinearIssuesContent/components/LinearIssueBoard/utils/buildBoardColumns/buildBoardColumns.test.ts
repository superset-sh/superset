import { describe, expect, test } from "bun:test";
import { buildBoardColumns, columnKeyFor } from "./buildBoardColumns";

const typeNames = {
	backlog: "Backlog",
	unstarted: "Todo",
	started: "In progress",
	completed: "Done",
	canceled: "Canceled",
};

const state = (
	id: string,
	type:
		| "triage"
		| "backlog"
		| "unstarted"
		| "started"
		| "completed"
		| "canceled",
	position: number,
) => ({ id, name: id, type, color: "#fff", position });

describe("buildBoardColumns", () => {
	test("uses one column per state type across teams, narrowed by the status filter", () => {
		expect(
			buildBoardColumns({
				teamStates: undefined,
				status: "all",
				typeNames,
			}).map((column) => column.key),
		).toEqual(["backlog", "unstarted", "started", "completed", "canceled"]);
		expect(
			buildBoardColumns({
				teamStates: undefined,
				status: "active",
				typeNames,
			}).map((column) => column.name),
		).toEqual(["Todo", "In progress"]);
	});

	test("uses a single team's own states, triage first and by position", () => {
		const columns = buildBoardColumns({
			teamStates: [
				state("review", "started", 5),
				state("todo", "unstarted", 1),
				state("progress", "started", 2),
				state("triage", "triage", 9),
			],
			status: "all",
			typeNames,
		});
		expect(columns.map((column) => column.stateId)).toEqual([
			"triage",
			"todo",
			"progress",
			"review",
		]);
	});
});

describe("columnKeyFor", () => {
	test("groups triage into backlog across teams and keys by state within a team", () => {
		expect(columnKeyFor(state("t", "triage", 0), false)).toBe("backlog");
		expect(columnKeyFor(state("t", "triage", 0), true)).toBe("t");
	});
});
