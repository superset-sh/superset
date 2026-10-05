import { describe, expect, test } from "bun:test";
import {
	accountToPinTo,
	type DraftTrigger,
	describeTriggerProblems,
	TRIGGER_KIND_CONNECTOR,
	triggerKindsForConnector,
} from "./automation-triggers";

describe("accountToPinTo", () => {
	test("pins to the only account the owner had", () => {
		expect(accountToPinTo(["work"], "personal")).toBe("work");
	});

	test("moves nothing when the owner had no account", () => {
		expect(accountToPinTo([], "work")).toBeNull();
	});

	test("moves nothing when the connect was a reconnect", () => {
		expect(accountToPinTo(["work"], "work")).toBeNull();
	});

	test("moves nothing once two accounts are already connected", () => {
		expect(accountToPinTo(["work", "personal"], "third")).toBeNull();
	});
});

describe("triggerKindsForConnector", () => {
	test("finds the kinds a connector delivers, including a renamed one", () => {
		expect(triggerKindsForConnector("linear")).toEqual(["linear"]);
		expect(triggerKindsForConnector("google")).toEqual(["gmail"]);
	});

	test("finds nothing for a connector no trigger kind comes from", () => {
		expect(triggerKindsForConnector("notion_mcp")).toEqual([]);
	});

	test("leaves the connectionless kinds unmapped", () => {
		expect(TRIGGER_KIND_CONNECTOR.schedule).toBeNull();
		expect(TRIGGER_KIND_CONNECTOR.webhook).toBeNull();
		expect(TRIGGER_KIND_CONNECTOR.github).toBeNull();
	});
});

describe("a trigger pinned to an account", () => {
	const pinned = (connectionId: string | null): DraftTrigger[] => [
		{
			connectionId,
			config: {
				kind: "schedule",
				rrule: "FREQ=HOURLY",
				dtstart: "2026-01-01T00:00:00.000Z",
				timezone: "UTC",
			},
		},
	];

	test("is a problem when the account is in no list", () => {
		const problems = describeTriggerProblems(pinned("gone"), {
			knownConnectionIds: ["work", "personal"],
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]?.field).toBe("connectionId");
		expect(problems[0]?.index).toBe(0);
	});

	test("is fine when the account is still listed", () => {
		expect(
			describeTriggerProblems(pinned("work"), {
				knownConnectionIds: ["work"],
			}),
		).toEqual([]);
	});

	test("says nothing when no account list was given", () => {
		expect(describeTriggerProblems(pinned("gone"))).toEqual([]);
	});

	test("says nothing about a trigger pinned to no account", () => {
		expect(
			describeTriggerProblems(pinned(null), { knownConnectionIds: [] }),
		).toEqual([]);
	});
});
