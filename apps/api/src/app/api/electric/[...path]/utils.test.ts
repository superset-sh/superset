import { beforeAll, describe, expect, mock, test } from "bun:test";

// Mock @superset/db/client BEFORE dynamic-importing utils.ts (which imports db).
// The Neon client requires DATABASE_URL; mocking prevents that connection error.
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findMany: async () => [{ organizationId: "org-test-123" }],
			},
		},
	},
}));

// NOTE: @superset/db/schema is NOT mocked so that QueryBuilder receives real
// Drizzle table/column objects and generates accurate SQL fragments.

// biome-ignore lint/suspicious/noExplicitAny: dynamic import for testability
let buildWhereClause: (...args: any[]) => Promise<any>;

beforeAll(async () => {
	({ buildWhereClause } = await import("./utils"));
});

describe("buildWhereClause", () => {
	describe("agent_commands", () => {
		test("returns a non-null WHERE clause scoped to organization_id", async () => {
			const orgId = "550e8400-e29b-41d4-a716-446655440000";
			const result = await buildWhereClause("agent_commands", orgId, "user-1");

			expect(result).not.toBeNull();
			// Fragment must reference the correct column
			expect(result.fragment).toContain("organization_id");
			// Param list must contain the org ID so Electric SQL can bind it
			expect(result.params).toContain(orgId);
		});

		test("uses a parameterised placeholder, not an inlined literal", async () => {
			// If the org ID were inlined into the fragment string Electric would
			// silently return wrong rows whenever the org ID changes.
			const orgId = "550e8400-e29b-41d4-a716-446655440001";
			const result = await buildWhereClause("agent_commands", orgId, "user-1");

			expect(result).not.toBeNull();
			expect(result.fragment).not.toContain(orgId);
			expect(result.fragment).toMatch(/\$\d+/);
		});

		test("empty organizationId still produces a syntactically valid clause", async () => {
			// The proxy passes organizationId ?? "" when the param is absent.
			// It must return a valid (non-null) clause even then.
			const result = await buildWhereClause("agent_commands", "", "user-1");
			expect(result).not.toBeNull();
		});
	});

	describe("device_presence", () => {
		test("returns a WHERE clause scoped to organization_id", async () => {
			const orgId = "550e8400-e29b-41d4-a716-446655440002";
			const result = await buildWhereClause("device_presence", orgId, "user-1");

			expect(result).not.toBeNull();
			expect(result.fragment).toContain("organization_id");
			expect(result.params).toContain(orgId);
		});
	});

	describe("unknown table", () => {
		test("returns null", async () => {
			const result = await buildWhereClause(
				"non_existent_table",
				"org-1",
				"user-1",
			);
			expect(result).toBeNull();
		});
	});

	describe("auth.organizations", () => {
		test("returns a non-null result when user has memberships", async () => {
			// db.query.members.findMany is mocked to return [{ organizationId: "org-test-123" }]
			const result = await buildWhereClause(
				"auth.organizations",
				"org-test-123",
				"user-1",
			);
			expect(result).not.toBeNull();
		});
	});

	describe("Electric SQL WHERE fragment round-trip", () => {
		// Reproduces the exact handling in the Electric proxy route:
		//   originUrl.searchParams.set("where", whereClause.fragment)
		//   originUrl.searchParams.set(`params[1]`, String(whereClause.params[0]))
		// If the fragment or params are malformed, Electric will silently return
		// no rows and every command targeted at a desktop device will time out.
		test("fragment and params survive URL searchParams round-trip", async () => {
			const orgId = "550e8400-e29b-41d4-a716-446655440003";
			const result = await buildWhereClause("agent_commands", orgId, "user-1");

			expect(result).not.toBeNull();

			const url = new URL("https://electric.example.com/v1/shape");
			url.searchParams.set("where", result.fragment);
			result.params.forEach((value: unknown, index: number) => {
				url.searchParams.set(`params[${index + 1}]`, String(value));
			});

			// Fragment must survive URL encoding/decoding intact
			expect(url.searchParams.get("where")).toBe(result.fragment);
			// The org ID must be recoverable as params[1]
			expect(url.searchParams.get("params[1]")).toBe(orgId);
		});

		test("fragment contains no SQL injection risk from orgId", async () => {
			// Passing a string with SQL metacharacters as the orgId must NOT
			// appear in the fragment — it must stay in params only.
			const orgId = "'; DROP TABLE agent_commands; --";
			const result = await buildWhereClause("agent_commands", orgId, "user-1");

			expect(result).not.toBeNull();
			expect(result.fragment).not.toContain(orgId);
		});
	});
});
