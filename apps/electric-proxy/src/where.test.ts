import { describe, expect, test } from "bun:test";
import { buildWhereClause } from "./where";

describe("buildWhereClause", () => {
	test("scopes organization-owned tables to the requested organization", () => {
		const clause = buildWhereClause("tasks", "org-1", ["org-1"]);

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain('"organization_id" = $1');
		expect(clause?.params).toEqual(["org-1"]);
	});

	test("limits auth.organizations to JWT organization memberships", () => {
		const clause = buildWhereClause("auth.organizations", "", [
			"org-1",
			"org-2",
		]);

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain('"id" in ($1, $2)');
		expect(clause?.params).toEqual(["org-1", "org-2"]);
	});

	test("denies auth.organizations when the JWT has no organizations", () => {
		expect(buildWhereClause("auth.organizations", "", [])).toEqual({
			fragment: "1 = 0",
			params: [],
		});
	});

	test("uses the restricted API key organization column", () => {
		const clause = buildWhereClause("auth.apikeys", "org-1", ["org-1"]);

		expect(clause).toEqual({
			fragment: '"organization_id" = $1',
			params: ["org-1"],
		});
	});

	test("rejects unknown table names", () => {
		expect(buildWhereClause("unknown_table", "org-1", ["org-1"])).toBeNull();
	});
});
