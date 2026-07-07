import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import type { ApiClient } from "../../types";
import {
	enqueueCloudPresence,
	flushCloudPresenceOutbox,
} from "./cloud-presence-outbox";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");
const ORG = "org-1";
const PROJECT_ID = "1f0e8c7e-1234-4abc-8def-0123456789ab";

// bun:sqlite drizzle stands in for better-sqlite3 (not loadable under bun),
// same cast the other host-service tests use.
function migratedDb(): HostDb {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(schema.projects)
		.values({ id: PROJECT_ID, repoPath: "/tmp/r" })
		.run();
	return db as unknown as HostDb;
}

function insertWorkspace(db: HostDb, id: string) {
	db.insert(schema.workspaces)
		.values({
			id,
			projectId: PROJECT_ID,
			worktreePath: `/tmp/w/${id}`,
			branch: `feat/${id}`,
			name: `ws ${id}`,
			type: "worktree",
			organizationId: ORG,
			updatedAt: Date.now(),
		})
		.run();
}

function outboxRows(db: HostDb) {
	return db
		.select()
		.from(schema.cloudPresenceOutbox)
		.all()
		.map((row) => `${row.op}:${row.workspaceId}`)
		.sort();
}

interface StubCalls {
	ensures: number;
	creates: { id?: string }[];
	deletes: string[];
}

function apiStub(overrides?: {
	create?: (input: { id?: string }) => Promise<unknown>;
	del?: (input: { id: string }) => Promise<unknown>;
	ensure?: () => Promise<unknown>;
}): { api: ApiClient; calls: StubCalls } {
	const calls: StubCalls = { ensures: 0, creates: [], deletes: [] };
	const api = {
		host: {
			ensure: {
				mutate: async () => {
					calls.ensures += 1;
					if (overrides?.ensure) return overrides.ensure();
					return { machineId: "m" };
				},
			},
		},
		v2Workspace: {
			create: {
				mutate: async (input: { id?: string }) => {
					calls.creates.push(input);
					if (overrides?.create) return overrides.create(input);
					return { id: input.id, createdByUserId: "user-1" };
				},
			},
			delete: {
				mutate: async (input: { id: string }) => {
					calls.deletes.push(input.id);
					if (overrides?.del) return overrides.del(input);
					return {};
				},
			},
		},
	} as unknown as ApiClient;
	return { api, calls };
}

function trpcError(code: string): Error {
	const err = new Error(code) as Error & { data: { code: string } };
	err.data = { code };
	return err;
}

describe("cloud-presence outbox", () => {
	it("latest local action wins: delete supersedes a pending create", () => {
		const db = migratedDb();
		enqueueCloudPresence(db, "ws-1", "create");
		enqueueCloudPresence(db, "ws-1", "delete");
		expect(outboxRows(db)).toEqual(["delete:ws-1"]);
	});

	it("flushes a pending create from the local row and backfills createdByUserId", async () => {
		const db = migratedDb();
		insertWorkspace(db, "ws-1");
		enqueueCloudPresence(db, "ws-1", "create");
		const { api, calls } = apiStub();
		const result = await flushCloudPresenceOutbox(db, api, ORG);
		expect(result).toEqual({ flushed: 1, dropped: 0, pending: 0 });
		expect(calls.ensures).toBe(1);
		expect(calls.creates[0]?.id).toBe("ws-1");
		const row = db.query.workspaces
			.findFirst({ where: (w, { eq }) => eq(w.id, "ws-1") })
			.sync();
		expect(row?.createdByUserId).toBe("user-1");
		expect(outboxRows(db)).toEqual([]);
	});

	it("drops a pending create whose local row is gone", async () => {
		const db = migratedDb();
		enqueueCloudPresence(db, "ws-gone", "create");
		const { api, calls } = apiStub();
		const result = await flushCloudPresenceOutbox(db, api, ORG);
		expect(result).toEqual({ flushed: 0, dropped: 1, pending: 0 });
		expect(calls.creates).toEqual([]);
		expect(outboxRows(db)).toEqual([]);
	});

	it("keeps everything queued when host.ensure fails (offline)", async () => {
		const db = migratedDb();
		insertWorkspace(db, "ws-1");
		enqueueCloudPresence(db, "ws-1", "create");
		enqueueCloudPresence(db, "ws-2", "delete");
		const { api, calls } = apiStub({
			ensure: async () => {
				throw new Error("offline");
			},
		});
		const result = await flushCloudPresenceOutbox(db, api, ORG);
		expect(result).toEqual({ flushed: 0, dropped: 0, pending: 2 });
		expect(calls.creates).toEqual([]);
		expect(calls.deletes).toEqual([]);
		expect(outboxRows(db).length).toBe(2);
	});

	it("keeps entries whose mirror hit a transport failure", async () => {
		const db = migratedDb();
		enqueueCloudPresence(db, "ws-down", "delete");
		const { api } = apiStub({
			del: async () => {
				throw new Error("cloud unreachable");
			},
		});
		const result = await flushCloudPresenceOutbox(db, api, ORG);
		expect(result).toEqual({ flushed: 0, dropped: 0, pending: 1 });
		expect(outboxRows(db)).toEqual(["delete:ws-down"]);
	});

	it("treats NOT_FOUND delete as success (already gone)", async () => {
		const db = migratedDb();
		enqueueCloudPresence(db, "ws-gone", "delete");
		const { api } = apiStub({
			del: async () => {
				throw trpcError("NOT_FOUND");
			},
		});
		const result = await flushCloudPresenceOutbox(db, api, ORG);
		expect(result).toEqual({ flushed: 1, dropped: 0, pending: 0 });
		expect(outboxRows(db)).toEqual([]);
	});

	it("drops unrecoverable rejections instead of retrying forever", async () => {
		const db = migratedDb();
		insertWorkspace(db, "ws-1");
		enqueueCloudPresence(db, "ws-1", "create");
		const { api } = apiStub({
			create: async () => {
				throw trpcError("CONFLICT");
			},
		});
		const result = await flushCloudPresenceOutbox(db, api, ORG);
		expect(result).toEqual({ flushed: 0, dropped: 1, pending: 0 });
		expect(outboxRows(db)).toEqual([]);
	});
});
