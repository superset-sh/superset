import { describe, expect, test } from "bun:test";
import {
	parseSessionSnapshot,
	serializeSessionSnapshot,
	shouldBootFromSavedSession,
} from "./savedSession";

describe("shouldBootFromSavedSession", () => {
	test("never when the server returned a user", () => {
		expect(
			shouldBootFromSavedSession({
				hasUser: true,
				error: { status: 500 },
				timedOut: true,
			}),
		).toBe(false);
	});

	test("never when the server answered with no session", () => {
		expect(
			shouldBootFromSavedSession({
				hasUser: false,
				error: null,
				timedOut: false,
			}),
		).toBe(false);
	});

	test.each([
		401, 403,
	])("never on %i, which is the server answering", (status) => {
		expect(
			shouldBootFromSavedSession({
				hasUser: false,
				error: { status },
				timedOut: false,
			}),
		).toBe(false);
	});

	test.each([
		undefined,
		0,
		408,
		429,
		500,
		502,
		503,
	])("when the read failed with status %p", (status) => {
		expect(
			shouldBootFromSavedSession({
				hasUser: false,
				error: { status },
				timedOut: false,
			}),
		).toBe(true);
	});

	test("when the read never came back", () => {
		expect(
			shouldBootFromSavedSession({
				hasUser: false,
				error: null,
				timedOut: true,
			}),
		).toBe(true);
	});
});

describe("session snapshot", () => {
	const createdAt = new Date("2026-01-01T00:00:00.000Z");
	const session = {
		user: { id: "user-1", email: "a@example.com", createdAt },
		session: {
			id: "session-1",
			token: "secret-token",
			activeOrganizationId: "org-a",
			expiresAt: new Date("2026-10-18T00:00:00.000Z"),
		},
	};

	test("leaves the token out of what is written", () => {
		expect(serializeSessionSnapshot(session)).not.toContain("secret-token");
	});

	test("round-trips with dates restored and the current token attached", () => {
		const restored = parseSessionSnapshot(
			serializeSessionSnapshot(session),
			"current-token",
		);
		expect(restored).toEqual({
			...session,
			session: { ...session.session, token: "current-token" },
		});
		expect(
			(restored?.user as { createdAt?: unknown }).createdAt,
		).toBeInstanceOf(Date);
	});

	test.each([
		null,
		undefined,
		"",
		"not json",
		"null",
		"{}",
		'{"user":{}}',
	])("rejects %p", (snapshot) => {
		expect(parseSessionSnapshot(snapshot, "token")).toBeNull();
	});
});
