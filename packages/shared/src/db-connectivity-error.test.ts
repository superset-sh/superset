import { describe, expect, it } from "bun:test";
import { isDatabaseConnectivityError } from "./db-connectivity-error";

describe("isDatabaseConnectivityError", () => {
	it("matches a raw ECONNREFUSED failure", () => {
		expect(
			isDatabaseConnectivityError(
				new Error("connect ECONNREFUSED 127.0.0.1:5432"),
			),
		).toBe(true);
	});

	it("matches a NeonDbError by name", () => {
		const error = new Error("fetch failed");
		error.name = "NeonDbError";
		expect(isDatabaseConnectivityError(error)).toBe(true);
	});

	it("matches an 'Unable to connect' cause", () => {
		const error = new Error("query failed", {
			cause: new Error("Unable to connect to database"),
		});
		expect(isDatabaseConnectivityError(error)).toBe(true);
	});

	it("does not match an unrelated error", () => {
		expect(isDatabaseConnectivityError(new Error("Validation failed"))).toBe(
			false,
		);
	});

	it("does not match a non-Error value", () => {
		expect(isDatabaseConnectivityError("some string")).toBe(false);
		expect(isDatabaseConnectivityError(null)).toBe(false);
	});
});
