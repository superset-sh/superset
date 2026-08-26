import { describe, expect, test } from "bun:test";
import type { SelectPage } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { assertPageReadable, assertPageWritable } from "./access";

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
});
