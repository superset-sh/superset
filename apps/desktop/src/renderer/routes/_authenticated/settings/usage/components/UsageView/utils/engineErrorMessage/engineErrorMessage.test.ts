import { describe, expect, test } from "bun:test";
import { engineErrorCode, engineErrorMessage } from "./engineErrorMessage";

describe("engineErrorMessage", () => {
	test("names each engine refusal in words the user can act on", () => {
		expect(engineErrorMessage(new Error("unsupported-platform"))).toContain(
			"Windows",
		);
		expect(engineErrorMessage(new Error("lock-loser"))).toContain(
			"Another Superset instance",
		);
		expect(engineErrorMessage(new Error("engine-unavailable"))).toContain(
			"not running on this host",
		);
		expect(engineErrorMessage(new Error("invalid-settings"))).toContain(
			"previous one still stands",
		);
	});

	test("leaves an unknown host failure to the caller's own sentence", () => {
		expect(engineErrorMessage(new Error("swap-verify-failed"))).toBeNull();
		expect(engineErrorCode(new Error("swap-verify-failed"))).toBe(
			"swap-verify-failed",
		);
	});
});
