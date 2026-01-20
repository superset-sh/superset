import { describe, expect, test } from "bun:test";

/**
 * Tests for the local-db module using bun:sqlite.
 */

describe("local-db", () => {
	test("can import getLocalDb function", async () => {
		const { getLocalDb } = await import("./index");
		expect(typeof getLocalDb).toBe("function");
	});

	test("getLocalDb returns a drizzle instance", async () => {
		const { getLocalDb } = await import("./index");
		const db = getLocalDb();
		expect(db).toBeDefined();
		expect(db.query).toBeDefined();
	});

	test("can query projects table", async () => {
		const { getLocalDb, projects } = await import("./index");
		const db = getLocalDb();
		const result = db.select().from(projects).limit(1).all();
		expect(Array.isArray(result)).toBe(true);
	});
});
