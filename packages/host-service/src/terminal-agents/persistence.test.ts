import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { terminalAgentBindings, terminalSessions } from "../db/schema";
import { SqliteTerminalAgentBindingPersistence } from "./persistence";
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
		lastEventAt = 2,
	}: {
		id: string;
		status: string;
		workspaceId: string | null;
		lastEventAt?: number;
	},
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
			lastEventAt,
			lastEventType: "Start",
		})
		.run();
}

describe("SqliteTerminalAgentBindingPersistence live reads", () => {
	it("hides bindings whose session is not active or workspace-less", () => {
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

		const persistence = new SqliteTerminalAgentBindingPersistence(db);
		const live = persistence.listLiveByWorkspace("ws-1");
		expect(live.map((binding) => binding.terminalId)).toEqual(["t-live"]);

		expect(persistence.findLiveActive("ws-1", "claude")?.terminalId).toBe(
			"t-live",
		);
	});

	it("routes store reads through the live join, never returning dead terminals", () => {
		const db = createTestDb();
		seedSession(db, {
			id: "t-dead",
			status: "exited",
			workspaceId: "ws-1",
			lastEventAt: 100,
		});
		seedSession(db, {
			id: "t-live",
			status: "active",
			workspaceId: "ws-1",
			lastEventAt: 5,
		});

		const store = new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		);
		// Hydration loads exited sessions into memory (get() still serves the
		// fresh-launch wait path), but list/find must hide them.
		expect(store.get("t-dead")).toBeDefined();
		expect(
			store.listByWorkspace("ws-1").map((binding) => binding.terminalId),
		).toEqual(["t-live"]);
		// Even though t-dead has the newer lastEventAt, findActive must not
		// route prompts into a dead terminal.
		expect(store.findActive("ws-1", "claude")?.terminalId).toBe("t-live");
	});

	it("findLiveActive prefers the most recently active binding", () => {
		const db = createTestDb();
		seedSession(db, {
			id: "t-old",
			status: "active",
			workspaceId: "ws-1",
			lastEventAt: 10,
		});
		seedSession(db, {
			id: "t-new",
			status: "active",
			workspaceId: "ws-1",
			lastEventAt: 20,
		});

		const persistence = new SqliteTerminalAgentBindingPersistence(db);
		expect(persistence.findLiveActive("ws-1", "claude")?.terminalId).toBe(
			"t-new",
		);
	});

	it("deleteDefunct drops rows for missing/exited/disposed/workspace-less sessions", () => {
		const db = createTestDb();
		seedSession(db, { id: "t-live", status: "active", workspaceId: "ws-1" });
		seedSession(db, { id: "t-exited", status: "exited", workspaceId: "ws-1" });
		seedSession(db, {
			id: "t-disposed",
			status: "disposed",
			workspaceId: "ws-1",
		});
		seedSession(db, { id: "t-orphan", status: "active", workspaceId: null });
		// Binding with no session row at all (FK unenforced in bun:sqlite).
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "t-missing",
				workspaceId: "ws-1",
				agentId: "claude",
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Start",
			})
			.run();

		new SqliteTerminalAgentBindingPersistence(db).deleteDefunct();

		const remaining = db
			.select({ terminalId: terminalAgentBindings.terminalId })
			.from(terminalAgentBindings)
			.all();
		expect(remaining.map((row) => row.terminalId)).toEqual(["t-live"]);
	});
});
