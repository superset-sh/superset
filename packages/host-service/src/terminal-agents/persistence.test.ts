import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { terminalAgentBindings, terminalSessions } from "../db/schema";
import {
	listDefunctBindingTerminalIds,
	reconcileTerminalAgentBindings,
	SqliteTerminalAgentBindingPersistence,
} from "./persistence";
import { TerminalAgentStore } from "./store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

function seedSession(
	db: HostDb,
	{
		id,
		status,
		workspaceId,
	}: { id: string; status: string; workspaceId: string | null },
) {
	db.insert(terminalSessions)
		.values({ id, status, originWorkspaceId: workspaceId, createdAt: 1 })
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId: id,
			workspaceId: workspaceId ?? "ws-1",
			agentId: "claude",
			startedAt: 1,
			lastEventAt: 2,
			lastEventType: "Attached",
		})
		.run();
}

describe("reconcileTerminalAgentBindings", () => {
	it("prunes bindings for exited/disposed/workspace-less sessions, keeps live ones", () => {
		const db = createTestDb();
		// The workspaces FK on originWorkspaceId is nullable and unenforced in
		// bun:sqlite unless PRAGMA foreign_keys is on; seed sessions directly.
		seedSession(db, { id: "t-live", status: "active", workspaceId: "ws-1" });
		seedSession(db, { id: "t-exited", status: "exited", workspaceId: "ws-1" });
		seedSession(db, {
			id: "t-disposed",
			status: "disposed",
			workspaceId: "ws-1",
		});
		seedSession(db, { id: "t-orphan", status: "active", workspaceId: null });

		// Shared predicate: also feeds the listByWorkspace read filter.
		expect([...listDefunctBindingTerminalIds(db)].sort()).toEqual([
			"t-disposed",
			"t-exited",
			"t-orphan",
		]);

		const store = new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		);
		// Hydration already skips disposed sessions; exited ones load.
		expect(store.get("t-exited")).toBeDefined();

		reconcileTerminalAgentBindings({ db, store });

		expect(store.get("t-live")).toBeDefined();
		expect(store.get("t-exited")).toBeUndefined();
		expect(store.get("t-disposed")).toBeUndefined();
		expect(store.get("t-orphan")).toBeUndefined();

		const remainingRows = db
			.select({ terminalId: terminalAgentBindings.terminalId })
			.from(terminalAgentBindings)
			.all();
		expect(remainingRows.map((row) => row.terminalId)).toEqual(["t-live"]);
	});
});
