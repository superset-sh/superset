import { describe, expect, test } from "bun:test";
import {
	mapPriorityFromPlain,
	mapThreadToTask,
	type PlainThread,
	plainSlugFromRef,
} from "./threads";

const ORG_ID = "org-1";
const CREATOR_ID = "user-1";

const STATUS_BY_EXTERNAL_ID = new Map([
	["TODO", "status-todo"],
	["SNOOZED", "status-snoozed"],
	["DONE", "status-done"],
]);

function buildThread(overrides: Partial<PlainThread> = {}): PlainThread {
	return {
		id: "th_123",
		ref: "T-42",
		title: "Cannot log in",
		description: "Customer reports a login loop.",
		previewText: "Hi, I can't log in…",
		priority: 2,
		status: "TODO",
		statusChangedAt: { iso8601: "2026-08-01T10:00:00Z" },
		customer: {
			id: "c_1",
			fullName: "Ada Lovelace",
			avatarUrl: null,
			email: { email: "ada@example.com" },
		},
		assignedTo: null,
		labels: [
			{ id: "l_1", labelType: { id: "lt_1", name: "Bug" } },
			{ id: "l_2", labelType: { id: "lt_2", name: "Billing" } },
		],
		createdAt: { iso8601: "2026-07-30T09:00:00Z" },
		updatedAt: { iso8601: "2026-08-01T10:00:00Z" },
		...overrides,
	};
}

describe("plainSlugFromRef", () => {
	test("namespaces refs so they can't collide with other providers", () => {
		expect(plainSlugFromRef("T-1327")).toBe("PL-1327");
		expect(plainSlugFromRef("X-9")).toBe("PL-X-9");
	});
});

describe("mapPriorityFromPlain", () => {
	test("maps Plain's integer priorities", () => {
		expect(mapPriorityFromPlain(0)).toBe("urgent");
		expect(mapPriorityFromPlain(1)).toBe("high");
		expect(mapPriorityFromPlain(2)).toBe("medium");
		expect(mapPriorityFromPlain(3)).toBe("low");
		expect(mapPriorityFromPlain(99)).toBe("none");
	});
});

describe("mapThreadToTask", () => {
	test("maps core thread fields", () => {
		const task = mapThreadToTask(
			buildThread(),
			ORG_ID,
			CREATOR_ID,
			new Map(),
			STATUS_BY_EXTERNAL_ID,
		);

		expect(task).not.toBeNull();
		expect(task?.slug).toBe("PL-42");
		expect(task?.externalKey).toBe("T-42");
		expect(task?.externalId).toBe("th_123");
		expect(task?.externalProvider).toBe("plain");
		expect(task?.title).toBe("Cannot log in");
		expect(task?.description).toBe(
			"Customer: Ada Lovelace <ada@example.com>\n\nCustomer reports a login loop.",
		);
		expect(task?.statusId).toBe("status-todo");
		expect(task?.priority).toBe("medium");
		expect(task?.labels).toEqual(["Bug", "Billing"]);
		expect(task?.completedAt).toBeNull();
	});

	test("falls back to previewText when there is no description", () => {
		const task = mapThreadToTask(
			buildThread({ description: null }),
			ORG_ID,
			CREATOR_ID,
			new Map(),
			STATUS_BY_EXTERNAL_ID,
		);
		expect(task?.description).toBe(
			"Customer: Ada Lovelace <ada@example.com>\n\nHi, I can't log in…",
		);
	});

	test("sets completedAt from statusChangedAt for done threads", () => {
		const task = mapThreadToTask(
			buildThread({ status: "DONE" }),
			ORG_ID,
			CREATOR_ID,
			new Map(),
			STATUS_BY_EXTERNAL_ID,
		);
		expect(task?.statusId).toBe("status-done");
		expect(task?.completedAt).toEqual(new Date("2026-08-01T10:00:00Z"));
	});

	test("treats UNKNOWN_THREAD_STATUS as todo", () => {
		const task = mapThreadToTask(
			buildThread({ status: "UNKNOWN_THREAD_STATUS" }),
			ORG_ID,
			CREATOR_ID,
			new Map(),
			STATUS_BY_EXTERNAL_ID,
		);
		expect(task?.statusId).toBe("status-todo");
	});

	test("matches an assigned Plain user to a Superset user by email", () => {
		const task = mapThreadToTask(
			buildThread({
				assignedTo: {
					__typename: "User",
					id: "u_1",
					fullName: "Grace Hopper",
					email: "grace@example.com",
					avatarUrl: null,
				},
			}),
			ORG_ID,
			CREATOR_ID,
			new Map([["grace@example.com", "superset-user-1"]]),
			STATUS_BY_EXTERNAL_ID,
		);
		expect(task?.assigneeId).toBe("superset-user-1");
		expect(task?.assigneeExternalId).toBeNull();
	});

	test("snapshots an unmatched assignee", () => {
		const task = mapThreadToTask(
			buildThread({
				assignedTo: {
					__typename: "MachineUser",
					id: "mu_1",
					fullName: "Support Bot",
				},
			}),
			ORG_ID,
			CREATOR_ID,
			new Map(),
			STATUS_BY_EXTERNAL_ID,
		);
		expect(task?.assigneeId).toBeNull();
		expect(task?.assigneeExternalId).toBe("mu_1");
		expect(task?.assigneeDisplayName).toBe("Support Bot");
	});

	test("returns null when no status can be resolved", () => {
		const task = mapThreadToTask(
			buildThread(),
			ORG_ID,
			CREATOR_ID,
			new Map(),
			new Map(),
		);
		expect(task).toBeNull();
	});
});
