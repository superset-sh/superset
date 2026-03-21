// @ts-nocheck
import { describe, expect, it } from "bun:test";
import {
	pickPreferredStatusByType,
	type TaskStatusCandidate,
} from "./issue-statuses";

describe("pickPreferredStatusByType", () => {
	it("prefers a non-external status when one exists", () => {
		const statuses: TaskStatusCandidate[] = [
			{ id: "linear-unstarted", type: "unstarted", externalProvider: "linear" },
			{ id: "local-unstarted", type: "unstarted", externalProvider: null },
		];

		expect(pickPreferredStatusByType(statuses, "unstarted")?.id).toBe(
			"local-unstarted",
		);
	});

	it("falls back to the first matching external status when no local status exists", () => {
		const statuses: TaskStatusCandidate[] = [
			{ id: "linear-unstarted", type: "unstarted", externalProvider: "linear" },
			{
				id: "linear-completed",
				type: "completed",
				externalProvider: "linear",
			},
		];

		expect(pickPreferredStatusByType(statuses, "unstarted")?.id).toBe(
			"linear-unstarted",
		);
	});

	it("returns undefined when no matching type exists", () => {
		const statuses: TaskStatusCandidate[] = [
			{ id: "linear-started", type: "started", externalProvider: "linear" },
		];

		expect(pickPreferredStatusByType(statuses, "completed")).toBeUndefined();
	});
});
