import { describe, expect, test } from "bun:test";
import { isMissingProcedureError } from "./isMissingProcedureError";

describe("isMissingProcedureError", () => {
	test("recognises old-host tRPC errors", () => {
		expect(
			isMissingProcedureError(
				new Error('No procedure found on path "tagFolders.upsert"'),
			),
		).toBe(true);
	});

	test("does not hide ordinary failures", () => {
		expect(
			isMissingProcedureError(new Error("fatal: not a git repository")),
		).toBe(false);
		expect(
			isMissingProcedureError({ data: { code: "INTERNAL_SERVER_ERROR" } }),
		).toBe(false);
		expect(
			isMissingProcedureError({
				data: { code: "NOT_FOUND" },
				message: "Tag folder scope not found",
			}),
		).toBe(false);
		expect(isMissingProcedureError(undefined)).toBe(false);
	});
});
