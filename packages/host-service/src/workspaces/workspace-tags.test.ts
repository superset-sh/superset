import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { workspaces, workspaceTags } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceChangedMessage } from "../events/types";
import {
	getWorkspaceTags,
	getWorkspaceTagsByWorkspaceId,
	insertLocalWorkspace,
	updateLocalWorkspace,
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

function seedWorkspace(
	db: HostDb,
	eventBus: EventBus,
	{ id, tags }: { id: string; tags?: string[] },
) {
	return insertLocalWorkspace(
		{ db, eventBus },
		{
			id,
			projectId: null,
			worktreePath: `/tmp/${id}`,
			branch: id,
			name: id,
			tags,
		},
	);
}

describe("workspace tags store", () => {
	it("insert writes normalized tags and broadcasts them", () => {
		const db = createTestDb();
		const { eventBus, messages } = createTestEventBus();
		seedWorkspace(db, eventBus, {
			id: "11111111-1111-4111-8111-111111111111",
			tags: ["Perf", " perf ", "Alpha"],
		});
		expect(
			getWorkspaceTags(db, "11111111-1111-4111-8111-111111111111"),
		).toEqual(["alpha", "perf"]);
		expect(messages[0]?.workspace?.tags).toEqual(["alpha", "perf"]);
	});

	it("insert without tags broadcasts an empty set", () => {
		const db = createTestDb();
		const { eventBus, messages } = createTestEventBus();
		seedWorkspace(db, eventBus, { id: "22222222-2222-4222-8222-222222222222" });
		expect(
			getWorkspaceTags(db, "22222222-2222-4222-8222-222222222222"),
		).toEqual([]);
		expect(messages[0]?.workspace?.tags).toEqual([]);
	});

	it("update replaces the whole tag set transactionally", () => {
		const db = createTestDb();
		const { eventBus, messages } = createTestEventBus();
		const id = "33333333-3333-4333-8333-333333333333";
		seedWorkspace(db, eventBus, { id, tags: ["old-a", "old-b"] });

		updateLocalWorkspace({ db, eventBus }, id, { tags: ["New", "zeta"] });
		expect(getWorkspaceTags(db, id)).toEqual(["new", "zeta"]);
		expect(messages.at(-1)?.workspace?.tags).toEqual(["new", "zeta"]);

		updateLocalWorkspace({ db, eventBus }, id, { tags: [] });
		expect(getWorkspaceTags(db, id)).toEqual([]);
	});

	it("update without a tags field leaves tags untouched", () => {
		const db = createTestDb();
		const { eventBus, messages } = createTestEventBus();
		const id = "44444444-4444-4444-8444-444444444444";
		seedWorkspace(db, eventBus, { id, tags: ["keep"] });

		updateLocalWorkspace({ db, eventBus }, id, { name: "renamed" });
		expect(getWorkspaceTags(db, id)).toEqual(["keep"]);
		expect(messages.at(-1)?.workspace?.tags).toEqual(["keep"]);
	});

	it("batch lookup groups and sorts per workspace", () => {
		const db = createTestDb();
		const { eventBus } = createTestEventBus();
		const a = "55555555-5555-4555-8555-555555555555";
		const b = "66666666-6666-4666-8666-666666666666";
		seedWorkspace(db, eventBus, { id: a, tags: ["zeta", "alpha"] });
		seedWorkspace(db, eventBus, { id: b, tags: ["solo"] });

		const map = getWorkspaceTagsByWorkspaceId(db, [a, b, "missing"]);
		expect(map.get(a)).toEqual(["alpha", "zeta"]);
		expect(map.get(b)).toEqual(["solo"]);
		expect(map.has("missing")).toBe(false);
		expect(getWorkspaceTagsByWorkspaceId(db, [])).toEqual(new Map());
	});

	it("deleting a workspace cascades its tag rows", () => {
		const db = createTestDb();
		const { eventBus } = createTestEventBus();
		const id = "77777777-7777-4777-8777-777777777777";
		seedWorkspace(db, eventBus, { id, tags: ["doomed"] });

		db.delete(workspaces).run();
		expect(db.select().from(workspaceTags).all()).toEqual([]);
	});

	it("duplicate normalized tags collapse instead of violating the PK", () => {
		const db = createTestDb();
		const { eventBus } = createTestEventBus();
		const id = "88888888-8888-4888-8888-888888888888";
		seedWorkspace(db, eventBus, { id, tags: ["Dup", "dup", " DUP "] });
		expect(getWorkspaceTags(db, id)).toEqual(["dup"]);
	});
});
