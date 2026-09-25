import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { ollamaRouter } from "./ollama";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createCallerWithDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return { caller: ollamaRouter.createCaller(ctx), db };
}

describe("ollamaRouter", () => {
	it("reports unconfigured on a fresh database", async () => {
		const { caller } = createCallerWithDb();
		await expect(caller.get()).resolves.toEqual({ configured: false });
	});

	it("stores a key without ever returning it", async () => {
		const { caller, db } = createCallerWithDb();
		await caller.setKey({ key: "secret-123" });
		await expect(caller.get()).resolves.toEqual({ configured: true });
		const row = db.select().from(schema.hostSettings).get();
		expect(row?.ollamaApiKey).toBe("secret-123");
	});

	it("rejects an empty key", async () => {
		const { caller } = createCallerWithDb();
		await expect(
			caller.setKey({ key: "" }).then(
				() => "resolved",
				(error: { code?: string }) => error.code,
			),
		).resolves.toBe("BAD_REQUEST");
	});

	it("clearKey removes the key", async () => {
		const { caller } = createCallerWithDb();
		await caller.setKey({ key: "secret-123" });
		await caller.clearKey();
		await expect(caller.get()).resolves.toEqual({ configured: false });
	});
});
