import { describe, expect, test } from "bun:test";
import { getPresenceStatus } from "./getPresenceStatus";

const base = {
	hasTargets: true,
	hasData: false,
	canFetch: true,
	hasFailedSinceSuccess: false,
};

describe("getPresenceStatus", () => {
	test("nothing to ask about is an answer", () => {
		expect(getPresenceStatus({ ...base, hasTargets: false })).toBe("ready");
	});

	test("data wins over a later failure, so a blip keeps the last answer", () => {
		expect(
			getPresenceStatus({
				...base,
				hasData: true,
				hasFailedSinceSuccess: true,
			}),
		).toBe("ready");
	});

	test("waits only while a fetch can still succeed for the first time", () => {
		expect(getPresenceStatus(base)).toBe("pending");
	});

	test("a failure stays unavailable while the next attempt is in flight", () => {
		expect(getPresenceStatus({ ...base, hasFailedSinceSuccess: true })).toBe(
			"unavailable",
		);
	});

	test("no relay URL to ask is unavailable, never an endless wait", () => {
		expect(getPresenceStatus({ ...base, canFetch: false })).toBe("unavailable");
	});
});
