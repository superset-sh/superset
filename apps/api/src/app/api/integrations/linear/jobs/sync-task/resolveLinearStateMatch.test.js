import { describe, expect, it } from "bun:test";
import { resolveLinearStateMatch } from "./resolveLinearStateMatch";

describe("resolveLinearStateMatch", () => {
	it("prefers exact external ID matches", () => {
		expect(
			resolveLinearStateMatch(
				[
					{ id: "state-1", name: "Todo", type: "unstarted" },
					{ id: "state-2", name: "In Progress", type: "started" },
				],
				{
					statusName: "Todo",
					statusExternalId: "state-2",
					statusType: "unstarted",
				},
			),
		).toEqual({
			matchedBy: "externalId",
			stateId: "state-2",
			stateName: "In Progress",
		});
	});

	it("matches by name when the external ID is from another team", () => {
		expect(
			resolveLinearStateMatch(
				[
					{ id: "state-1", name: "Todo", type: "unstarted" },
					{ id: "state-2", name: "In Progress", type: "started" },
				],
				{
					statusName: "todo",
					statusExternalId: "other-team-state",
					statusType: "unstarted",
				},
			),
		).toEqual({
			matchedBy: "name",
			stateId: "state-1",
			stateName: "Todo",
		});
	});

	it("falls back by type only when there is a single candidate", () => {
		expect(
			resolveLinearStateMatch(
				[
					{ id: "state-1", name: "Todo", type: "unstarted" },
					{ id: "state-2", name: "Done", type: "completed" },
				],
				{
					statusName: "Closed",
					statusType: "completed",
				},
			),
		).toEqual({
			matchedBy: "uniqueType",
			stateId: "state-2",
			stateName: "Done",
		});
	});

	it("refuses ambiguous type-only matches", () => {
		expect(
			resolveLinearStateMatch(
				[
					{ id: "state-1", name: "In Progress", type: "started" },
					{ id: "state-2", name: "Review", type: "started" },
				],
				{
					statusName: "Blocked",
					statusType: "started",
				},
			),
		).toEqual({
			matchedBy: "ambiguousType",
			candidateNames: ["In Progress", "Review"],
		});
	});
});
