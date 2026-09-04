import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { workspaces } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceChangedMessage } from "../events/types";
import {
	archiveLocalWorkspace,
	getLocalWorkspace,
	insertLocalWorkspace,
	touchLocalWorkspaceActivity,
	updateLocalWorkspace,
	WORKSPACE_ACTIVITY_THROTTLE_MS,
} from "./local-workspace-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

function createTestEventBus(): {
	eventBus: EventBus;
	messages: WorkspaceChangedMessage[];
} {
	const messages: WorkspaceChangedMessage[] = [];
	const eventBus = {
		broadcastWorkspaceChanged: (
			message: Omit<WorkspaceChangedMessage, "type">,
		) => {
			messages.push({ type: "workspace:changed", ...message });
		},
	} as unknown as EventBus;
	return { eventBus, messages };
}

const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function setup(options: { initialActivityAt?: number | null } = {}) {
	const db = createTestDb();
	const { eventBus, messages } = createTestEventBus();
	insertLocalWorkspace(
		{ db, eventBus },
		{
			id: WORKSPACE_ID,
			projectId: null,
			worktreePath: `/tmp/${WORKSPACE_ID}`,
			branch: "feature",
			name: "feature",
		},
	);
	if (options.initialActivityAt !== undefined) {
		db.update(workspaces)
			.set({ lastActivityAt: options.initialActivityAt })
			.where(eq(workspaces.id, WORKSPACE_ID))
			.run();
	}
	// Drop the insert's own `created` broadcast so assertions only see touches.
	messages.length = 0;
	return { db, eventBus, messages };
}

describe("workspace lastActivityAt", () => {
	it("stamps creation as the first activity on insert", () => {
		const db = createTestDb();
		const { eventBus, messages } = createTestEventBus();
		const before = Date.now();
		const row = insertLocalWorkspace(
			{ db, eventBus },
			{
				id: WORKSPACE_ID,
				projectId: null,
				worktreePath: `/tmp/${WORKSPACE_ID}`,
				branch: "feature",
				name: "feature",
			},
		);
		expect(row.lastActivityAt).not.toBeNull();
		expect(row.lastActivityAt ?? 0).toBeGreaterThanOrEqual(before);
		expect(messages[0]?.workspace?.lastActivityAt).toBe(row.lastActivityAt);
	});

	it("carries null through the snapshot for rows that predate the column", () => {
		const { db, eventBus, messages } = setup({ initialActivityAt: null });
		updateLocalWorkspace({ db, eventBus }, WORKSPACE_ID, { name: "renamed" });
		expect(messages[0]?.workspace?.lastActivityAt).toBeNull();
	});
});

describe("touchLocalWorkspaceActivity", () => {
	it("writes immediately when the row has never been touched", () => {
		const { db, eventBus, messages } = setup({ initialActivityAt: null });
		const occurredAt = 1_700_000_000_000;

		expect(
			touchLocalWorkspaceActivity({ db, eventBus }, WORKSPACE_ID, occurredAt),
		).toBe(true);

		expect(getLocalWorkspace(db, WORKSPACE_ID)?.lastActivityAt).toBe(
			occurredAt,
		);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			workspaceId: WORKSPACE_ID,
			eventType: "updated",
			workspace: { id: WORKSPACE_ID, lastActivityAt: occurredAt },
		});
	});

	it("writes the first event after a quiet period but drops the chatty ones inside the window", () => {
		const base = 1_700_000_000_000;
		const { db, eventBus, messages } = setup({
			initialActivityAt: base - WORKSPACE_ACTIVITY_THROTTLE_MS,
		});

		// Exactly one window later: the first event after the quiet period.
		expect(
			touchLocalWorkspaceActivity({ db, eventBus }, WORKSPACE_ID, base),
		).toBe(true);
		expect(getLocalWorkspace(db, WORKSPACE_ID)?.lastActivityAt).toBe(base);

		// Every tool-use hook inside the window is a no-op.
		expect(
			touchLocalWorkspaceActivity({ db, eventBus }, WORKSPACE_ID, base + 1),
		).toBe(false);
		expect(
			touchLocalWorkspaceActivity(
				{ db, eventBus },
				WORKSPACE_ID,
				base + WORKSPACE_ACTIVITY_THROTTLE_MS - 1,
			),
		).toBe(false);
		expect(getLocalWorkspace(db, WORKSPACE_ID)?.lastActivityAt).toBe(base);
		expect(messages).toHaveLength(1);

		// The window has elapsed: write again.
		const later = base + WORKSPACE_ACTIVITY_THROTTLE_MS;
		expect(
			touchLocalWorkspaceActivity({ db, eventBus }, WORKSPACE_ID, later),
		).toBe(true);
		expect(getLocalWorkspace(db, WORKSPACE_ID)?.lastActivityAt).toBe(later);
		expect(messages).toHaveLength(2);
	});

	it("leaves updatedAt alone so metadata consumers do not see a phantom edit", () => {
		const { db, eventBus } = setup({ initialActivityAt: null });
		const updatedAtBefore = getLocalWorkspace(db, WORKSPACE_ID)?.updatedAt;

		touchLocalWorkspaceActivity(
			{ db, eventBus },
			WORKSPACE_ID,
			1_700_000_000_000,
		);

		expect(getLocalWorkspace(db, WORKSPACE_ID)?.updatedAt).toBe(
			updatedAtBefore,
		);
	});

	it("ignores archived rows", () => {
		const { db, eventBus, messages } = setup({ initialActivityAt: null });
		archiveLocalWorkspace({ db, eventBus }, WORKSPACE_ID, "deleted");
		messages.length = 0;

		expect(
			touchLocalWorkspaceActivity(
				{ db, eventBus },
				WORKSPACE_ID,
				1_700_000_000_000,
			),
		).toBe(false);

		expect(getLocalWorkspace(db, WORKSPACE_ID)?.lastActivityAt).toBeNull();
		expect(messages).toHaveLength(0);
	});

	it("ignores unknown workspace ids", () => {
		const { db, eventBus, messages } = setup();
		expect(
			touchLocalWorkspaceActivity(
				{ db, eventBus },
				"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				1_700_000_000_000,
			),
		).toBe(false);
		expect(messages).toHaveLength(0);
	});

	it("does not move lastActivityAt on a metadata update", () => {
		const activityAt = 1_700_000_000_000;
		const { db, eventBus } = setup({ initialActivityAt: activityAt });

		updateLocalWorkspace({ db, eventBus }, WORKSPACE_ID, {
			name: "renamed",
			tags: ["perf"],
		});

		const row = getLocalWorkspace(db, WORKSPACE_ID);
		expect(row?.lastActivityAt).toBe(activityAt);
		expect(row?.updatedAt ?? 0).toBeGreaterThan(activityAt);
	});
});
