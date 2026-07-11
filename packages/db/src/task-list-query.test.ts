import { describe, expect, test } from "bun:test";
import { and, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildTaskListConditions,
	buildTaskListOrderBy,
	InvalidDueDateRangeError,
	normalizeDueDateRange,
} from "./task-list-query";

const dialect = new PgDialect();
const ORG = "00000000-0000-0000-0000-000000000001";

function render(chunks: SQL<unknown>[]) {
	const combined = and(...chunks);
	if (!combined) throw new Error("no sql");
	return dialect.sqlToQuery(combined);
}

function renderOne(chunk: SQL<unknown>) {
	return dialect.sqlToQuery(chunk);
}

describe("buildTaskListConditions", () => {
	test("always scopes by organization and excludes deleted by default", () => {
		const { sql, params } = render(
			buildTaskListConditions({ organizationId: ORG }),
		);
		expect(sql).toContain("organization_id");
		expect(sql.toLowerCase()).toContain("deleted_at");
		expect(params).toEqual([ORG]);
	});

	test("includeDeleted drops the deleted_at filter", () => {
		const { sql } = render(
			buildTaskListConditions({ organizationId: ORG, includeDeleted: true }),
		);
		expect(sql.toLowerCase()).not.toContain("deleted_at");
	});

	test("escapes LIKE wildcards in search and matches title or description", () => {
		const { sql, params } = render(
			buildTaskListConditions({ organizationId: ORG, search: "50%_off" }),
		);
		expect(params).toContain("%50\\%\\_off%");
		expect(sql.toLowerCase()).toContain("title");
		expect(sql.toLowerCase()).toContain("description");
	});

	test("externalProjectName is an escaped case-insensitive prefix match", () => {
		const { sql, params } = render(
			buildTaskListConditions({
				organizationId: ORG,
				externalProjectName: "Al_pha",
			}),
		);
		expect(sql.toLowerCase()).toContain("ilike");
		expect(params).toContain("Al\\_pha%");
	});

	test("statusType filters via an IN-subquery on task_statuses", () => {
		const { sql, params } = render(
			buildTaskListConditions({ organizationId: ORG, statusType: "started" }),
		);
		expect(sql.toLowerCase()).toContain("task_statuses");
		expect(sql.toLowerCase()).toContain(" in ");
		expect(params).toContain("started");
	});

	test("due date bounds render as gte/lte on due_date", () => {
		const { sql, params } = render(
			buildTaskListConditions({
				organizationId: ORG,
				dueDateFrom: new Date("2026-07-01T00:00:00.000Z"),
				dueDateTo: new Date("2026-07-31T23:59:59.999Z"),
			}),
		);
		expect(sql).toContain(">=");
		expect(sql).toContain("<=");
		expect(params.length).toBe(3);
	});
});

describe("buildTaskListOrderBy", () => {
	test("defaults to createdAt desc with id tiebreak", () => {
		const [primary, tiebreak] = buildTaskListOrderBy();
		expect(renderOne(primary).sql.toLowerCase()).toContain("created_at");
		expect(renderOne(primary).sql.toLowerCase()).toContain("desc");
		expect(renderOne(tiebreak).sql.toLowerCase()).toContain("id");
		expect(renderOne(tiebreak).sql.toLowerCase()).toContain("asc");
	});

	test("priority desc ranks urgent highest via enum-derived CASE", () => {
		const [primary] = buildTaskListOrderBy("priority", "desc");
		const { sql, params } = renderOne(primary);
		expect(sql.toLowerCase()).toContain("case");
		// [value, rank] pairs flattened in enum order: urgent highest.
		expect(params).toEqual([
			"urgent",
			4,
			"high",
			3,
			"medium",
			2,
			"low",
			1,
			"none",
			0,
		]);
	});

	test("dueDate pushes nulls last in both directions", () => {
		for (const order of ["asc", "desc"] as const) {
			const [primary] = buildTaskListOrderBy("dueDate", order);
			const { sql } = renderOne(primary);
			expect(sql.toLowerCase()).toContain(`${order} nulls last`);
		}
	});
});

describe("normalizeDueDateRange", () => {
	test("normalizes to UTC day boundaries", () => {
		const { from, to } = normalizeDueDateRange(
			"2026-07-10T15:30:00Z",
			"2026-07-12T01:00:00Z",
		);
		expect(from?.toISOString()).toBe("2026-07-10T00:00:00.000Z");
		expect(to?.toISOString()).toBe("2026-07-12T23:59:59.999Z");
	});

	test("allows same-day ranges regardless of time of day", () => {
		expect(() =>
			normalizeDueDateRange("2026-07-10T23:00:00Z", "2026-07-10T01:00:00Z"),
		).not.toThrow();
	});

	test("rejects inverted ranges", () => {
		expect(() =>
			normalizeDueDateRange("2026-07-12T00:00:00Z", "2026-07-10T00:00:00Z"),
		).toThrow(InvalidDueDateRangeError);
	});

	test("handles open-ended bounds", () => {
		expect(normalizeDueDateRange(undefined, undefined)).toEqual({
			from: undefined,
			to: undefined,
		});
		const { from, to } = normalizeDueDateRange(
			"2026-07-10T12:00:00Z",
			undefined,
		);
		expect(from?.toISOString()).toBe("2026-07-10T00:00:00.000Z");
		expect(to).toBeUndefined();
	});
});
