import { describe, expect, test } from "bun:test";
import type { SelectPage } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import {
	assertPageCommentable,
	assertPageReadable,
	assertPageWritable,
	pageAccess,
} from "./access";

const OWNER = "user-owner";
const OTHER = "user-other";

function page(overrides: Partial<SelectPage> = {}): SelectPage {
	return {
		visibility: "org",
		createdByUserId: OWNER,
		...overrides,
	} as SelectPage;
}

function codeOf(fn: () => void): string | undefined {
	try {
		fn();
	} catch (error) {
		return error instanceof TRPCError ? error.code : "not-a-trpc-error";
	}
	return undefined;
}

describe("assertPageReadable", () => {
	test("org pages are readable by any member", () => {
		expect(codeOf(() => assertPageReadable(page(), OTHER))).toBeUndefined();
	});

	test("just_me pages are readable by their creator", () => {
		const row = page({ visibility: "just_me" });
		expect(codeOf(() => assertPageReadable(row, OWNER))).toBeUndefined();
	});

	test("just_me pages hide their existence from everyone else", () => {
		const row = page({ visibility: "just_me" });
		expect(codeOf(() => assertPageReadable(row, OTHER))).toBe("NOT_FOUND");
	});
});

describe("assertPageWritable", () => {
	test("the creator can publish new versions", () => {
		expect(codeOf(() => assertPageWritable(page(), OWNER))).toBeUndefined();
	});

	test("another member cannot publish over an org page", () => {
		expect(codeOf(() => assertPageWritable(page(), OTHER))).toBe("FORBIDDEN");
	});

	test("a just_me page stays NOT_FOUND rather than leaking via FORBIDDEN", () => {
		const row = page({ visibility: "just_me" });
		expect(codeOf(() => assertPageWritable(row, OTHER))).toBe("NOT_FOUND");
	});

	test("a taken-down page refuses its own creator", () => {
		const row = page({ takenDownAt: new Date() });
		expect(codeOf(() => assertPageWritable(row, OWNER))).toBe("FORBIDDEN");
	});

	test("a taken-down just_me page still answers NOT_FOUND to an outsider", () => {
		const row = page({ visibility: "just_me", takenDownAt: new Date() });
		expect(codeOf(() => assertPageWritable(row, OTHER))).toBe("NOT_FOUND");
	});

	test("a page that was never taken down is unaffected", () => {
		const row = page({ takenDownAt: null });
		expect(codeOf(() => assertPageWritable(row, OWNER))).toBeUndefined();
	});
});

describe("pageAccess", () => {
	const at = (
		overrides: Partial<SelectPage>,
		shareRole: "view" | "comment" | null,
	) => pageAccess(page(overrides), OTHER, shareRole);

	test("a private page shared with someone becomes readable to them", () => {
		expect(at({ visibility: "just_me" }, "view").canRead).toBe(true);
		expect(at({ visibility: "just_me" }, null).canRead).toBe(false);
	});

	test("comment access follows the share role on a private page", () => {
		expect(at({ visibility: "just_me" }, "view").canComment).toBe(false);
		expect(at({ visibility: "just_me" }, "comment").canComment).toBe(true);
	});

	test("general access comments only when its role allows it", () => {
		expect(at({ organizationRole: "comment" }, null).canComment).toBe(true);
		expect(at({ organizationRole: "view" }, null).canComment).toBe(false);
	});

	test("a comment share outranks a view-only organization", () => {
		expect(at({ organizationRole: "view" }, "comment").canComment).toBe(true);
	});

	test("only the owner manages, and not once the page is taken down", () => {
		expect(pageAccess(page(), OWNER, null).canManage).toBe(true);
		expect(at({}, "comment").canManage).toBe(false);
		expect(
			pageAccess(page({ takenDownAt: new Date() }), OWNER, null).canManage,
		).toBe(false);
	});
});

describe("assertPageCommentable", () => {
	test("a viewer is told they can view but not comment", () => {
		const row = page({ organizationRole: "view" });
		expect(codeOf(() => assertPageCommentable(row, OTHER, null))).toBe(
			"FORBIDDEN",
		);
	});

	test("an outsider to a private page still gets NOT_FOUND", () => {
		const row = page({ visibility: "just_me" });
		expect(codeOf(() => assertPageCommentable(row, OTHER, null))).toBe(
			"NOT_FOUND",
		);
	});
});

describe("assertPageWritable with a share", () => {
	test("someone a private page is shared with is told they can't change it", () => {
		const row = page({ visibility: "just_me" });
		expect(codeOf(() => assertPageWritable(row, OTHER, "comment"))).toBe(
			"FORBIDDEN",
		);
	});
});
