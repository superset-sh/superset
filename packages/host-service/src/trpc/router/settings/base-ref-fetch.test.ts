import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { baseRefFetchRouter } from "./base-ref-fetch";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createCallerWithDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return { caller: baseRefFetchRouter.createCaller(ctx), db };
}

describe("baseRefFetchRouter", () => {
	it("defaults to enabled on a fresh database", async () => {
		const { caller } = createCallerWithDb();
		await expect(caller.get()).resolves.toEqual({ enabled: true });
	});

	it("round-trips disabled and re-enabled", async () => {
		const { caller } = createCallerWithDb();
		await caller.set({ enabled: false });
		await expect(caller.get()).resolves.toEqual({ enabled: false });
		await caller.set({ enabled: true });
		await expect(caller.get()).resolves.toEqual({ enabled: true });
	});

	it("fail-open: an unexpected stored value reads as enabled", async () => {
		const { caller, db } = createCallerWithDb();
		db.insert(schema.hostSettings)
			.values({ id: 1, baseRefFetchEnabled: 2 })
			.run();
		await expect(caller.get()).resolves.toEqual({ enabled: true });
	});
});
