import { describe, expect, test } from "bun:test";
import { resolveStoredToken } from "./resolveStoredToken";

describe("resolveStoredToken", () => {
	test("keeps a token whose stored expiry has passed", () => {
		expect(
			resolveStoredToken({
				token: "session-token",
				expiresAt: "2026-09-17T11:06:32.000Z",
			}),
		).toBe("session-token");
	});

	test("keeps a token whose stored expiry is in the future", () => {
		expect(
			resolveStoredToken({
				token: "session-token",
				expiresAt: "2999-01-01T00:00:00.000Z",
			}),
		).toBe("session-token");
	});

	test("returns null when nothing is stored", () => {
		expect(resolveStoredToken({ token: null, expiresAt: null })).toBeNull();
		expect(resolveStoredToken(null)).toBeNull();
		expect(resolveStoredToken(undefined)).toBeNull();
	});
});
