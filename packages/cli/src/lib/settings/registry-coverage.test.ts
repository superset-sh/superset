import { describe, expect, test } from "bun:test";
import { settings } from "@superset/local-db/schema";
import { EXCLUDED_SETTINGS_COLUMNS, SETTINGS } from "./registry";

/**
 * Drift ratchet: every column of the desktop's settings table must be either
 * exposed through the CLI registry or explicitly excluded with a reason.
 * When the desktop adds a settings column, this test fails until someone
 * makes a conscious choice — expose it (one registry entry) or exclude it.
 */
describe("settings registry coverage", () => {
	const columns = Object.keys(settings).filter(
		(key) => key !== "id" && !key.startsWith("_") && !key.startsWith("$"),
	);
	const exposed = new Set(SETTINGS.map((def) => def.key as string));
	const excluded = new Set(Object.keys(EXCLUDED_SETTINGS_COLUMNS));

	test("column introspection actually sees the table", () => {
		// guard against vacuous passes if drizzle's shape changes
		expect(columns.length).toBeGreaterThan(30);
		expect(columns).toContain("confirmOnQuit");
	});

	test("every settings column is exposed or consciously excluded", () => {
		const unaccounted = columns.filter(
			(column) => !exposed.has(column) && !excluded.has(column),
		);
		expect(unaccounted).toEqual([]);
	});

	test("no column is both exposed and excluded", () => {
		const both = columns.filter(
			(column) => exposed.has(column) && excluded.has(column),
		);
		expect(both).toEqual([]);
	});

	test("exclusion list has no stale entries", () => {
		const stale = [...excluded].filter((key) => !columns.includes(key));
		expect(stale).toEqual([]);
	});
});
