import { beforeEach, describe, expect, test } from "bun:test";
import { useShareInviteStore } from "./shareInviteStore";

const dev = {
	kind: "user" as const,
	person: { userId: "u1", name: "Dev", email: "dev@acme.dev", image: null },
};
const sam = { kind: "email" as const, email: "sam@acme.dev" };
const store = () => useShareInviteStore.getState();

describe("shareInviteStore", () => {
	beforeEach(() => store().reset());

	test("a pick is staged once, with the role it was picked at", () => {
		store().stage(dev, "comment");
		store().stage(dev, "view");
		expect(store().staged).toEqual([dev]);
		expect(store().roles).toEqual({ "user:u1": "comment" });
	});

	test("each pick keeps its own role, and unstaging drops it", () => {
		store().stage(dev, "comment");
		store().stage(sam, "comment");
		store().setRole("email:sam@acme.dev", "view");
		store().unstage("user:u1");
		expect(store().staged).toEqual([sam]);
		expect(store().roles).toEqual({ "email:sam@acme.dev": "view" });
	});
});
