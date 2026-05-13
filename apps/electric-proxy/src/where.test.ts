import { describe, expect, test } from "bun:test";
import { buildWhereClause } from "./where";

describe("buildWhereClause", () => {
	describe("auth.users", () => {
		test("uses Electric-SQL-compatible ANY syntax for organization_ids", () => {
			// Regression test for #4487: PR #4482 switched this fragment to
			// `"organization_ids" @> ARRAY[$1]::uuid[]`, which Electric SQL's
			// WHERE clause parser rejects with HTTP 400
			// (`At location 19: Could not select an operator overload`).
			// The `= ANY(...)` form is parseable by Electric SQL even though it
			// won't use the GIN index on `organization_ids`.
			const result = buildWhereClause(
				"auth.users",
				"00000000-0000-0000-0000-000000000001",
				["00000000-0000-0000-0000-000000000001"],
			);

			expect(result).not.toBeNull();
			expect(result?.fragment).not.toContain("@>");
			expect(result?.fragment).not.toContain("ARRAY[");
			expect(result?.fragment).toBe(`$1 = ANY("organization_ids")`);
			expect(result?.params).toEqual(["00000000-0000-0000-0000-000000000001"]);
		});
	});
});
