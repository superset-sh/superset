import { describe, expect, test } from "bun:test";
import { pageCommentUser } from "./pageCommentUser";

describe("pageCommentUser", () => {
	test("takes id, name and image from the session", () => {
		const session = {
			user: { id: "u1", name: "Ada", image: "https://example.test/a.png" },
		};
		expect(pageCommentUser(session, "You")).toEqual({
			id: "u1",
			name: "Ada",
			image: "https://example.test/a.png",
		});
	});

	test("falls back to the given name when the session has none", () => {
		const session = { user: { id: "u1", name: null, image: null } };
		expect(pageCommentUser(session, "You").name).toBe("You");
	});

	test("is blank without a session, but still names the reader", () => {
		expect(pageCommentUser(null, "You")).toEqual({
			id: "",
			name: "You",
			image: null,
		});
		expect(pageCommentUser(undefined, "You").id).toBe("");
	});
});
