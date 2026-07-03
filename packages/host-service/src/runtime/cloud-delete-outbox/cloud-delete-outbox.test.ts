import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import type { ApiClient } from "../../types";
import {
	enqueueCloudDelete,
	flushCloudDeleteOutbox,
} from "./cloud-delete-outbox";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

// bun:sqlite drizzle stands in for better-sqlite3 (not loadable under bun),
// same cast the other host-service tests use.
function migratedDb(): HostDb {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function outboxIds(db: HostDb) {
	return db
		.select()
		.from(schema.cloudDeleteOutbox)
		.all()
		.map((row) => row.workspaceId)
		.sort();
}

function apiStub(mutate: (input: { id: string }) => Promise<unknown>) {
	return {
		v2Workspace: { delete: { mutate } },
	} as unknown as ApiClient;
}

describe("cloud-delete outbox", () => {
	it("enqueue is idempotent", () => {
		const db = migratedDb();
		enqueueCloudDelete(db, "ws-1");
		enqueueCloudDelete(db, "ws-1");
		expect(outboxIds(db)).toEqual(["ws-1"]);
	});

	it("flush removes entries the cloud delete succeeded for", async () => {
		const db = migratedDb();
		enqueueCloudDelete(db, "ws-1");
		enqueueCloudDelete(db, "ws-2");
		const deleted: string[] = [];
		const result = await flushCloudDeleteOutbox(
			db,
			apiStub(async ({ id }) => {
				deleted.push(id);
			}),
		);
		expect(deleted.sort()).toEqual(["ws-1", "ws-2"]);
		expect(result).toEqual({ deleted: 2, pending: 0 });
		expect(outboxIds(db)).toEqual([]);
	});

	it("keeps entries whose delete failed, for the next flush", async () => {
		const db = migratedDb();
		enqueueCloudDelete(db, "ws-ok");
		enqueueCloudDelete(db, "ws-down");
		const result = await flushCloudDeleteOutbox(
			db,
			apiStub(async ({ id }) => {
				if (id === "ws-down") throw new Error("cloud unreachable");
			}),
		);
		expect(result).toEqual({ deleted: 1, pending: 1 });
		expect(outboxIds(db)).toEqual(["ws-down"]);
	});

	it("treats NOT_FOUND as success (already deleted elsewhere)", async () => {
		const db = migratedDb();
		enqueueCloudDelete(db, "ws-gone");
		const result = await flushCloudDeleteOutbox(
			db,
			apiStub(async () => {
				const err = new Error("not found") as Error & {
					data: { code: string };
				};
				err.data = { code: "NOT_FOUND" };
				throw err;
			}),
		);
		expect(result).toEqual({ deleted: 1, pending: 0 });
		expect(outboxIds(db)).toEqual([]);
	});
});
