import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	retireTaskSlug,
	retireTaskSlugOnConflict,
	taskHadSlugLike,
	taskSlugLookupOrder,
	taskSlugMatches,
} from "./task-slug-lookup";

const dialect = new PgDialect();

describe("taskSlugMatches", () => {
	test("matches the current slug or any previous slug", () => {
		const { sql, params } = dialect.sqlToQuery(
			taskSlugMatches("fix-mobile-bug-opening-duplicate-panes"),
		);
		expect(sql).toContain('"tasks"."slug" = $1');
		expect(sql).toContain('"tasks"."previous_slugs" @> $2');
		expect(params).toEqual([
			"fix-mobile-bug-opening-duplicate-panes",
			'{"fix-mobile-bug-opening-duplicate-panes"}',
		]);
	});
});

describe("taskSlugLookupOrder", () => {
	test("puts the current slug first, then the oldest task", () => {
		const [exact, oldest] = taskSlugLookupOrder("fix-sync");
		expect(dialect.sqlToQuery(exact).sql).toContain('"tasks"."slug" = $1 desc');
		expect(dialect.sqlToQuery(oldest).sql).toContain('"created_at" asc');
	});
});

describe("retireTaskSlug", () => {
	test("appends the current slug unless it already equals the new one", () => {
		const { sql, params } = dialect.sqlToQuery(retireTaskSlug("SUPER-2177"));
		expect(sql).toBe(
			'CASE WHEN "tasks"."slug" = $1 THEN "tasks"."previous_slugs" ELSE array_append("tasks"."previous_slugs", "tasks"."slug") END',
		);
		expect(params).toEqual(["SUPER-2177"]);
	});

	test("on conflict compares against the excluded row", () => {
		const { sql } = dialect.sqlToQuery(retireTaskSlugOnConflict());
		expect(sql).toContain('"tasks"."slug" = excluded.slug');
	});
});

describe("taskHadSlugLike", () => {
	test("searches the previous slugs with the pattern", () => {
		const { sql, params } = dialect.sqlToQuery(taskHadSlugLike("fix-sync%"));
		expect(sql).toContain('unnest("tasks"."previous_slugs")');
		expect(params).toEqual(["fix-sync%"]);
	});
});
