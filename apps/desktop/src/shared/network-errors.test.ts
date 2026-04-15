import { describe, expect, it } from "bun:test";
import {
	getErrorMessage,
	isTransientNetworkError,
	isTransientNetworkErrorMessage,
} from "./network-errors";

describe("isTransientNetworkErrorMessage", () => {
	it("matches ERR_NETWORK_CHANGED in message text", () => {
		expect(
			isTransientNetworkErrorMessage(
				"Update failed: net::ERR_NETWORK_CHANGED",
			),
		).toBe(true);
	});

	it("matches case-insensitively", () => {
		expect(
			isTransientNetworkErrorMessage(
				"update failed: NET::ERR_CONNECTION_TIMED_OUT",
			),
		).toBe(true);
	});

	it("returns false for non-network errors", () => {
		expect(isTransientNetworkErrorMessage("permission denied")).toBe(false);
	});
});

describe("getErrorMessage", () => {
	it("extracts message/code/cause from error-like objects", () => {
		const error = {
			message: "Failed to check for updates",
			code: "ERR_NETWORK_CHANGED",
			cause: new Error("net::ERR_NETWORK_CHANGED"),
		};

		expect(getErrorMessage(error)).toContain("ERR_NETWORK_CHANGED");
		expect(getErrorMessage(error)).toContain("net::ERR_NETWORK_CHANGED");
	});
});

describe("isTransientNetworkError", () => {
	it("detects transient network errors from error-like objects", () => {
		const error = {
			message: "Failed to check for updates",
			code: "ERR_NETWORK_CHANGED",
		};
		expect(isTransientNetworkError(error)).toBe(true);
	});

	it("returns false for non-network error objects", () => {
		expect(isTransientNetworkError({ message: "random failure" })).toBe(false);
	});
});
