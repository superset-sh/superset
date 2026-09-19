import { describe, expect, it } from "bun:test";
import { decideSessionRead } from "./decideSessionRead";

const returningUser = {
	userId: null,
	error: null,
	isSettled: true,
	isOwnWrite: false,
	hasToken: true,
	isSigningOut: false,
	lastUserId: "user-a",
};

describe("decideSessionRead", () => {
	it("keeps the last session as ended when the server answers with no session", () => {
		expect(decideSessionRead(returningUser)).toEqual({
			type: "keep-last-session",
			status: "ended",
		});
	});

	it.each([
		401, 403,
	])("treats a %i as the server ending the session", (status) => {
		expect(decideSessionRead({ ...returningUser, error: { status } })).toEqual({
			type: "keep-last-session",
			status: "ended",
		});
	});

	it.each([
		undefined,
		0,
		408,
		429,
		500,
		503,
	])("keeps the last session as unconfirmed when the read failed with status %p", (status) => {
		expect(decideSessionRead({ ...returningUser, error: { status } })).toEqual({
			type: "keep-last-session",
			status: "unconfirmed",
		});
	});

	it("lets an explicit log out empty the session", () => {
		expect(decideSessionRead({ ...returningUser, isSigningOut: true })).toEqual(
			{ type: "ignore" },
		);
		expect(decideSessionRead({ ...returningUser, hasToken: false })).toEqual({
			type: "ignore",
		});
	});

	it("leaves a first run with nothing saved on the sign-in page", () => {
		expect(decideSessionRead({ ...returningUser, lastUserId: null })).toEqual({
			type: "ignore",
		});
	});

	it("waits for a read that is still in flight", () => {
		expect(decideSessionRead({ ...returningUser, isSettled: false })).toEqual({
			type: "ignore",
		});
	});

	it("never takes a session it loaded itself as the server confirming it", () => {
		expect(
			decideSessionRead({
				...returningUser,
				userId: "user-a",
				isOwnWrite: true,
			}),
		).toEqual({ type: "ignore" });
	});

	it("confirms the same account without a remount", () => {
		expect(decideSessionRead({ ...returningUser, userId: "user-a" })).toEqual({
			type: "confirmed",
			accountChanged: false,
		});
	});

	it("flags a different account coming back", () => {
		expect(decideSessionRead({ ...returningUser, userId: "user-b" })).toEqual({
			type: "confirmed",
			accountChanged: true,
		});
	});

	it("does not flag the first account on this machine as a change", () => {
		expect(
			decideSessionRead({
				...returningUser,
				userId: "user-a",
				lastUserId: null,
			}),
		).toEqual({ type: "confirmed", accountChanged: false });
	});

	it("does not confirm a session the server could not be asked about", () => {
		expect(
			decideSessionRead({
				...returningUser,
				userId: "user-a",
				error: { status: 503 },
			}),
		).toEqual({ type: "ignore" });
	});
});
