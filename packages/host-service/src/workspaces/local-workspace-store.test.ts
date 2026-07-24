import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import type { EventBus } from "../events";
import {
	getLocalWorkspace,
	insertLocalWorkspace,
	updateLocalWorkspace,
} from "./local-workspace-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
let testRoot: string | null = null;

function createTestContext(path = ":memory:") {
	const sqlite = new Database(path);
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const testDb = drizzle(sqlite, { schema });
	migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });
	const db = testDb as unknown as HostDb;
	db.insert(schema.projects)
		.values({
			id: "project",
			repoPath: "/repo",
			createdAt: Date.now(),
		})
		.run();
	const events: Array<{ workspaceId: string; eventType: string }> = [];
	const eventBus = {
		broadcastWorkspaceChanged: (event: {
			workspaceId: string;
			eventType: string;
		}) => events.push(event),
	} as unknown as EventBus;
	return { db, eventBus, events, sqlite };
}

afterEach(() => {
	if (testRoot) rmSync(testRoot, { recursive: true, force: true });
	testRoot = null;
});

describe("local subworkspaces", () => {
	it("persists a separate logical row with its parent's git context", () => {
		const ctx = createTestContext();
		insertLocalWorkspace(ctx, {
			id: "parent",
			projectId: "project",
			worktreePath: "/repo",
			branch: "main",
			name: "Parent",
			type: "main",
			agentDelegationMode: "workspaces",
		});
		insertLocalWorkspace(ctx, {
			id: "child",
			projectId: "project",
			worktreePath: "/repo",
			branch: "main",
			name: "Child",
			type: "subworkspace",
			parentWorkspaceId: "parent",
			agentDelegationMode: "workspaces",
		});

		expect(getLocalWorkspace(ctx.db, "child")).toMatchObject({
			id: "child",
			type: "subworkspace",
			parentWorkspaceId: "parent",
			worktreePath: "/repo",
			branch: "main",
			agentDelegationMode: "workspaces",
		});

		updateLocalWorkspace(ctx, "parent", {
			branch: "renamed",
			worktreePath: "/renamed-repo",
		});
		expect(getLocalWorkspace(ctx.db, "child")).toMatchObject({
			parentWorkspaceId: "parent",
			worktreePath: "/renamed-repo",
			branch: "renamed",
		});
	});

	it("survives host database close and reopen until explicitly deleted", () => {
		testRoot = mkdtempSync(
			join(tmpdir(), "superset-subworkspace-persistence-"),
		);
		const dbPath = join(testRoot, "host.db");
		const first = createTestContext(dbPath);
		insertLocalWorkspace(first, {
			id: "parent",
			projectId: "project",
			worktreePath: "/repo",
			branch: "main",
			name: "Parent",
			type: "main",
			agentDelegationMode: "workspaces",
		});
		insertLocalWorkspace(first, {
			id: "child",
			projectId: "project",
			worktreePath: "/repo",
			branch: "main",
			name: "Child",
			type: "subworkspace",
			parentWorkspaceId: "parent",
			agentDelegationMode: "workspaces",
		});
		first.sqlite.close();

		const reopenedSqlite = new Database(dbPath);
		reopenedSqlite.exec("PRAGMA foreign_keys = ON;");
		const reopenedDb = drizzle(reopenedSqlite, {
			schema,
		}) as unknown as HostDb;

		expect(getLocalWorkspace(reopenedDb, "child")).toMatchObject({
			id: "child",
			type: "subworkspace",
			parentWorkspaceId: "parent",
			worktreePath: "/repo",
			branch: "main",
			agentDelegationMode: "workspaces",
		});
		reopenedSqlite.close();
	});
});
