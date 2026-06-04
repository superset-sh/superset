// Reproduction for issue #5103:
// "CLI-created terminals not visible in Desktop UI: read path unaware of
//  Drizzle ORM sessions"
//
// The Desktop workspace session pane lists terminals via the host-service
// tRPC `terminal.listSessions` query, which delegates to `listTerminalSessions()`
// (see src/trpc/router/terminal/terminal.ts). That function reads ONLY the
// in-memory `sessions` Map in terminal.ts — it never reconciles with the
// persisted `terminal_sessions` Drizzle table.
//
// A terminal can be persisted as active in Drizzle while ABSENT from a given
// host-service process's in-memory Map. This happens whenever the writer and
// the reader are not the same live in-memory map, e.g.:
//   - the in-memory Map was cleared on a pty-daemon disconnect (terminal.ts
//     `onDaemonDisconnect` calls `sessions.clear()`) or a host-service restart,
//   - the CLI talks to a host-service instance whose in-memory Map differs from
//     the one feeding the Desktop pane.
//
// In all of those cases the row exists in Drizzle (and the PTY is still owned by
// the daemon), yet `listTerminalSessions()` returns nothing — so the Desktop
// session pane renders empty even though an agent is actively running.
//
// This test models that state directly: an active `terminal_sessions` row is
// persisted in Drizzle, but the in-memory Map (which this test never populates,
// because doing so requires a live daemon) is empty. It asserts the read path
// surfaces the persisted session. It currently FAILS, reproducing the bug.
//
// Note: this runs under `bun test` (no native pty-daemon / better-sqlite3
// required) by building the host schema on bun:sqlite via the real migrations.
// The full end-to-end adoption harness lives in terminal.adoption.node-test.ts.

import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema.ts";
import { listTerminalSessions } from "./terminal.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");

function applyMigrations(sqlite: Database): void {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	for (const file of files) {
		const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
		for (const statement of sql.split("--> statement-breakpoint")) {
			const trimmed = statement.trim();
			if (trimmed.length > 0) sqlite.exec(trimmed);
		}
	}
}

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
const workspaceId = randomUUID();
const projectId = randomUUID();
const terminalId = `cli-created-${randomUUID().slice(0, 8)}`;

beforeAll(() => {
	sqlite = new Database(":memory:");
	applyMigrations(sqlite);
	db = drizzle(sqlite, { schema });

	db.insert(schema.projects)
		.values({ id: projectId, repoPath: "/tmp/repro-5103" })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath: "/tmp/repro-5103/worktree",
			branch: "main",
		})
		.run();

	// A terminal created via `superset terminals create --workspace <id>`:
	// persisted as active, never ended.
	db.insert(schema.terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "active",
			createdAt: 1_700_000_000_000,
		})
		.run();
});

afterAll(() => {
	sqlite?.close();
});

describe("issue #5103 — Desktop session pane vs persisted Drizzle sessions", () => {
	test("sanity: the active terminal session is persisted in Drizzle", () => {
		const persisted = db
			.select()
			.from(schema.terminalSessions)
			.where(
				and(
					eq(schema.terminalSessions.originWorkspaceId, workspaceId),
					eq(schema.terminalSessions.status, "active"),
					isNull(schema.terminalSessions.endedAt),
				),
			)
			.all();

		expect(persisted.map((r) => r.id)).toContain(terminalId);
	});

	test("the Desktop session pane read path surfaces persisted-active sessions", () => {
		// Every terminal that is active in Drizzle and belongs to the workspace
		// is something the Desktop session pane is expected to display.
		const activeInDrizzle = db
			.select()
			.from(schema.terminalSessions)
			.where(
				and(
					eq(schema.terminalSessions.originWorkspaceId, workspaceId),
					eq(schema.terminalSessions.status, "active"),
					isNull(schema.terminalSessions.endedAt),
				),
			)
			.all();

		// What the Desktop workspace session pane actually renders
		// (workspaceTrpc.terminal.listSessions -> listTerminalSessions).
		const visibleInPane = listTerminalSessions({
			workspaceId,
			includeExited: false,
		});
		const visibleIds = new Set(visibleInPane.map((s) => s.terminalId));

		const missing = activeInDrizzle
			.map((r) => r.id)
			.filter((id) => !visibleIds.has(id));

		// BUG (#5103): persisted-active sessions are missing from the pane because
		// listTerminalSessions() only reads the in-memory Map and never reconciles
		// with the terminal_sessions table. This expectation fails today.
		expect(missing).toEqual([]);
	});
});
