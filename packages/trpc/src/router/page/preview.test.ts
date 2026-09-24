import { describe, expect, test } from "bun:test";
import { previewAccess } from "./preview";

const OWNER = "user-owner";
const OTHER = "user-other";

const member = (userId: string) => ({ userId, isMember: async () => true });
const outsider = (userId: string) => ({ userId, isMember: async () => false });

describe("previewAccess", () => {
	test("public pages preview for anyone", async () => {
		expect(
			await previewAccess(
				{ visibility: "everyone", createdByUserId: OWNER },
				undefined,
			),
		).toBe("readable");
	});

	test("org pages need a reader before they show anything", async () => {
		expect(
			await previewAccess(
				{ visibility: "org", createdByUserId: OWNER },
				undefined,
			),
		).toBe("needs_user");
	});

	test("org pages preview for a member", async () => {
		expect(
			await previewAccess(
				{ visibility: "org", createdByUserId: OWNER },
				member(OTHER),
			),
		).toBe("readable");
	});

	test("a reader outside the organization sees nothing", async () => {
		expect(
			await previewAccess(
				{ visibility: "org", createdByUserId: OWNER },
				outsider(OTHER),
			),
		).toBe("missing");
	});

	test("just_me pages preview only for their creator", async () => {
		const page = { visibility: "just_me" as const, createdByUserId: OWNER };
		expect(await previewAccess(page, member(OWNER))).toBe("readable");
		expect(await previewAccess(page, member(OTHER))).toBe("missing");
		expect(await previewAccess(page, undefined)).toBe("needs_user");
	});
});
