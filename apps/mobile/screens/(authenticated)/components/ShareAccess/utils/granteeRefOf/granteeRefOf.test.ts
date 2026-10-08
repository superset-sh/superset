import { describe, expect, test } from "bun:test";
import type { ShareGrantee } from "@superset/shared/sharing";
import { findGrantee, granteeKey, granteeRefOf } from "./granteeRefOf";

const grantees: ShareGrantee[] = [
	{ kind: "team", teamId: "t1", name: "Design", memberCount: 1, role: "view" },
	{
		kind: "user",
		userId: "u1",
		name: "Dev",
		email: "dev@acme.dev",
		image: null,
		role: null,
	},
	{
		kind: "invitation",
		invitationId: "i1",
		email: "sam@acme.dev",
		role: "comment",
	},
];

describe("granteeKey", () => {
	test("each grantee round-trips through its route key", () => {
		for (const grantee of grantees) {
			expect(findGrantee(grantees, granteeKey(granteeRefOf(grantee)))).toBe(
				grantee,
			);
		}
	});

	test("a team and a user with the same id stay apart", () => {
		expect(granteeKey({ kind: "team", teamId: "x" })).not.toBe(
			granteeKey({ kind: "user", userId: "x" }),
		);
	});
});
