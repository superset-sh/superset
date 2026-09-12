import { describe, expect, test } from "bun:test";
import { agentLaunchFailureDetail } from "./agentLaunchFailures";

const UNKNOWN = "unknown error";

describe("agentLaunchFailureDetail", () => {
	test("returns null when no agents were reported", () => {
		expect(agentLaunchFailureDetail(undefined, UNKNOWN)).toBeNull();
		expect(agentLaunchFailureDetail([], UNKNOWN)).toBeNull();
	});

	test("returns null when every launch succeeded", () => {
		expect(
			agentLaunchFailureDetail([{ ok: true }, { ok: true }], UNKNOWN),
		).toBeNull();
	});

	test("reports a single host error", () => {
		expect(
			agentLaunchFailureDetail(
				[{ ok: false, error: "no agent config for `claude`" }],
				UNKNOWN,
			),
		).toBe("no agent config for `claude`");
	});

	test("joins every failed launch, not just the first", () => {
		expect(
			agentLaunchFailureDetail(
				[
					{ ok: false, error: "first failure" },
					{ ok: true },
					{ ok: false, error: "second failure" },
				],
				UNKNOWN,
			),
		).toBe("first failure; second failure");
	});

	test("stands in for a blank host message instead of returning a falsy detail", () => {
		expect(agentLaunchFailureDetail([{ ok: false, error: "" }], UNKNOWN)).toBe(
			UNKNOWN,
		);
		expect(
			agentLaunchFailureDetail([{ ok: false, error: "   " }], UNKNOWN),
		).toBe(UNKNOWN);
	});

	test("stands in for a host that omitted `error` instead of throwing", () => {
		// A union-violating payload: nothing validates the event on the way in,
		// and a throw here would be caught as a *create* failure and delete a
		// workspace the host kept.
		const malformed = [{ ok: false }] as unknown as Parameters<
			typeof agentLaunchFailureDetail
		>[0];
		expect(agentLaunchFailureDetail(malformed, UNKNOWN)).toBe(UNKNOWN);
	});

	test("keeps the stand-in in place when only one of several is blank", () => {
		expect(
			agentLaunchFailureDetail(
				[
					{ ok: false, error: "" },
					{ ok: false, error: "boom" },
				],
				UNKNOWN,
			),
		).toBe(`${UNKNOWN}; boom`);
	});
});
