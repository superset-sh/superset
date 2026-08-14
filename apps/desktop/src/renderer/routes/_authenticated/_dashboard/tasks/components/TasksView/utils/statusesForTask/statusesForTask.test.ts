import { describe, expect, test } from "bun:test";
import type { SelectTaskStatus } from "@superset/db/schema";
import { statusesForTask } from "./statusesForTask";

function status(id: string, externalProvider: "linear" | "plain" | null) {
	return { id, externalProvider } as SelectTaskStatus;
}

const STATUSES = [
	status("default", null),
	status("linear", "linear"),
	status("plain", "plain"),
];

describe("statusesForTask", () => {
	test("plain tasks only see plain statuses", () => {
		const result = statusesForTask(STATUSES, { externalProvider: "plain" });
		expect(result.map((s) => s.id)).toEqual(["plain"]);
	});

	test("non-plain tasks never see plain statuses", () => {
		expect(
			statusesForTask(STATUSES, { externalProvider: "linear" }).map(
				(s) => s.id,
			),
		).toEqual(["default", "linear"]);
		expect(
			statusesForTask(STATUSES, { externalProvider: null }).map((s) => s.id),
		).toEqual(["default", "linear"]);
	});
});
