import { describe, expect, test } from "bun:test";
import {
	type AccountProfileUser,
	resolveAccountProfileView,
} from "./resolveAccountProfileView";

const collectionUser: AccountProfileUser = {
	name: "Ada Lovelace",
	email: "ada@example.com",
	image: "https://cdn.example.com/ada.png",
};

const sessionUser = {
	id: "user_1",
	name: "Ada Lovelace",
	email: "ada@example.com",
	image: "https://lh3.googleusercontent.com/ada",
};

describe("resolveAccountProfileView", () => {
	test("prefers the freshest collection row when it has synced", () => {
		const view = resolveAccountProfileView({
			sessionUser,
			collectionUser,
		});
		expect(view).toEqual({ kind: "profile", user: collectionUser });
	});

	// Reproduces #3450 (tracked in #5591): a user signed in with Google sees the
	// account profile stuck at the skeleton because the `users` Electric
	// collection never reached `isReady` and its row hasn't arrived — even
	// though the authenticated session already carries the profile fields.
	test("falls back to the session user when the collection has not synced", () => {
		const view = resolveAccountProfileView({
			sessionUser,
			collectionUser: undefined,
		});

		expect(view.kind).toBe("profile");
		if (view.kind === "profile") {
			expect(view.user.email).toBe("ada@example.com");
			expect(view.user.name).toBe("Ada Lovelace");
			expect(view.user.image).toBe("https://lh3.googleusercontent.com/ada");
		}
	});

	test("shows the skeleton only while the session itself is resolving", () => {
		const view = resolveAccountProfileView({
			sessionUser: undefined,
			collectionUser: undefined,
		});
		expect(view.kind).toBe("loading");
	});

	test("shows unavailable when the session resolved with no user", () => {
		const view = resolveAccountProfileView({
			sessionUser: null,
			collectionUser: undefined,
		});
		expect(view.kind).toBe("unavailable");
	});

	test("treats a session user without an email as absent", () => {
		const view = resolveAccountProfileView({
			sessionUser: { id: "user_1", name: "No Email" },
			collectionUser: undefined,
		});
		expect(view.kind).toBe("unavailable");
	});
});
