import { describe, expect, test } from "bun:test";
import { pickGithubStatus } from "./pickGithubStatus";

const hold = (reason: "rate-limited" | "unreachable" | "auth") => ({
	reason,
	since: 1,
	until: 2,
});

describe("pickGithubStatus", () => {
	test("returns null when every host is healthy or predates the field", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "local", status: null },
					{ machineId: "remote", status: undefined },
				],
				"local",
			),
		).toBeNull();
	});

	test("prefers the local machine's hold over a remote one", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "remote", status: hold("unreachable") },
					{ machineId: "local", status: hold("rate-limited") },
				],
				"local",
			),
		).toEqual(hold("rate-limited"));
	});

	test("falls back to any remote hold when the local sweep is healthy", () => {
		expect(
			pickGithubStatus(
				[
					{ machineId: "local", status: null },
					{ machineId: "remote", status: hold("auth") },
				],
				"local",
			),
		).toEqual(hold("auth"));
	});
});
