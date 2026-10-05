import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { TagFoldersChangedMessage } from "../events/types";
import {
	deleteTagFolderSetting,
	getAllTagFolderSettings,
	getTagFolderSettings,
	hasTagFolderScope,
	upsertTagFolderSetting,
} from "./tag-folder-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createHarness() {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = ON");
	const rawDb = drizzle(sqlite, { schema });
	migrate(rawDb, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	const db = rawDb as unknown as HostDb;
	db.insert(projects)
		.values({ id: PROJECT, repoPath: "/tmp/repo", createdAt: 1 })
		.run();
	const messages: TagFoldersChangedMessage[] = [];
	const eventBus = {
		broadcastTagFoldersChanged: (
			message: Omit<TagFoldersChangedMessage, "type">,
		) => {
			messages.push({ type: "tag-folders:changed", ...message });
		},
	} as unknown as EventBus;
	return { db, eventBus, messages };
}

describe("tag folder settings store", () => {
	it("recognizes Sessions and existing projects, but not unknown UUIDs", () => {
		const h = createHarness();
		expect(hasTagFolderScope(h.db, SESSIONS_TAG_SCOPE)).toBe(true);
		expect(hasTagFolderScope(h.db, PROJECT)).toBe(true);
		expect(
			hasTagFolderScope(h.db, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
		).toBe(false);
	});

	it("creates on first customisation and merge-upserts after", () => {
		const h = createHarness();
		upsertTagFolderSetting(
			{ db: h.db, eventBus: h.eventBus },
			PROJECT,
			" Perf ",
			{
				displayName: "Perf Work",
			},
		);
		upsertTagFolderSetting(
			{ db: h.db, eventBus: h.eventBus },
			PROJECT,
			"perf",
			{
				color: "#ff0000",
			},
		);
		expect(getTagFolderSettings(h.db, PROJECT, null)).toEqual([
			{
				tag: "perf",
				displayName: "Perf Work",
				color: "#ff0000",
				tabOrder: null,
			},
		]);
	});

	it("broadcasts the scope's full set on change", () => {
		const h = createHarness();
		upsertTagFolderSetting(
			{ db: h.db, eventBus: h.eventBus },
			PROJECT,
			"perf",
			{
				color: "#ff0000",
			},
		);
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]?.scope).toBe(PROJECT);
		expect(h.messages[0]?.settings).toEqual([
			{
				scope: PROJECT,
				tag: "perf",
				displayName: null,
				color: "#ff0000",
				tabOrder: null,
			},
		]);
	});

	it("is idempotent on delete", () => {
		const h = createHarness();
		upsertTagFolderSetting(
			{ db: h.db, eventBus: h.eventBus },
			PROJECT,
			"perf",
			{
				color: "#ff0000",
			},
		);
		deleteTagFolderSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf");
		deleteTagFolderSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf");
		expect(getTagFolderSettings(h.db, PROJECT, null)).toEqual([]);
	});

	it("rejects a tag that cannot be normalized", () => {
		const h = createHarness();
		expect(
			upsertTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus },
				PROJECT,
				"   ",
				{
					color: "#ff0000",
				},
			),
		).toBeUndefined();
	});

	// The whole point of the scope column: the Sessions lane has no project
	// row, so this would have been impossible under the old (project_id, tag).
	it("stores settings for the project-less Sessions scope", () => {
		const h = createHarness();
		upsertTagFolderSetting(
			{ db: h.db, eventBus: h.eventBus },
			SESSIONS_TAG_SCOPE,
			"backend",
			{ color: "#00ff00", displayName: "Backend" },
		);
		expect(getTagFolderSettings(h.db, SESSIONS_TAG_SCOPE, null)).toEqual([
			{
				tag: "backend",
				displayName: "Backend",
				color: "#00ff00",
				tabOrder: null,
			},
		]);
	});

	it("keeps the same tag independent across scopes", () => {
		const h = createHarness();
		upsertTagFolderSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "api", {
			color: "#ff0000",
		});
		upsertTagFolderSetting(
			{ db: h.db, eventBus: h.eventBus },
			SESSIONS_TAG_SCOPE,
			"api",
			{ color: "#0000ff" },
		);
		expect(getTagFolderSettings(h.db, PROJECT, null)[0]?.color).toBe("#ff0000");
		expect(getTagFolderSettings(h.db, SESSIONS_TAG_SCOPE, null)[0]?.color).toBe(
			"#0000ff",
		);
	});

	describe("per-user folders", () => {
		const me = { userId: "user-a" };
		const them = { userId: "user-b" };

		it("a customised folder is the customiser's own", () => {
			const h = createHarness();
			upsertTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus, ...me },
				PROJECT,
				"perf",
				{ displayName: "Performance" },
			);
			expect(getTagFolderSettings(h.db, PROJECT, "user-a")).toEqual([
				{
					tag: "perf",
					displayName: "Performance",
					color: null,
					tabOrder: null,
				},
			]);
			expect(getTagFolderSettings(h.db, PROJECT, "user-b")).toEqual([]);
			expect(getAllTagFolderSettings(h.db, "user-b")).toEqual([]);
		});

		it("two users customise the same folder independently", () => {
			const h = createHarness();
			upsertTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus, ...me },
				PROJECT,
				"perf",
				{ color: "#ff0000" },
			);
			upsertTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus, ...them },
				PROJECT,
				"perf",
				{ color: "#0000ff" },
			);
			expect(getTagFolderSettings(h.db, PROJECT, "user-a")[0]?.color).toBe(
				"#ff0000",
			);
			expect(getTagFolderSettings(h.db, PROJECT, "user-b")[0]?.color).toBe(
				"#0000ff",
			);
			deleteTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus, ...me },
				PROJECT,
				"perf",
			);
			expect(getTagFolderSettings(h.db, PROJECT, "user-a")).toEqual([]);
			expect(getTagFolderSettings(h.db, PROJECT, "user-b")[0]?.color).toBe(
				"#0000ff",
			);
		});

		it("a legacy row is visible to everyone until someone claims it", () => {
			const h = createHarness();
			// Written before folders had owners (no acting user).
			upsertTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus },
				PROJECT,
				"perf",
				{ displayName: "Legacy", color: "#00ff00" },
			);
			expect(
				getTagFolderSettings(h.db, PROJECT, "user-b")[0]?.displayName,
			).toBe("Legacy");
			upsertTagFolderSetting(
				{ db: h.db, eventBus: h.eventBus, ...me },
				PROJECT,
				"perf",
				{ displayName: "Mine" },
			);
			// The claim keeps what the patch didn't touch and leaves one row.
			expect(getTagFolderSettings(h.db, PROJECT, "user-a")).toEqual([
				{ tag: "perf", displayName: "Mine", color: "#00ff00", tabOrder: null },
			]);
			expect(getTagFolderSettings(h.db, PROJECT, "user-b")).toEqual([]);
			expect(h.db.select().from(schema.tagFolderSettings).all()).toHaveLength(
				1,
			);
		});
	});
});

describe("project collection last writes", () => {
	it("exposes existing modification dates and preserves the author date", () => {
		const h = createHarness();
		upsertTagFolderSetting({ ...h, userId: "alice" }, "projects", "team", {
			displayName: "New",
			...{ updatedAt: 100, create: true },
		});
		expect(getAllTagFolderSettings(h.db, "alice")[0]).toMatchObject({
			updatedAt: 100,
		});
	});
	it("rejects older replay and does not resurrect a deleted presentation", () => {
		const h = createHarness();
		const ctx = { ...h, userId: "alice" };
		upsertTagFolderSetting(ctx, "projects", "team", {
			displayName: "New",
			...{ updatedAt: 200, create: true },
		});
		upsertTagFolderSetting(ctx, "projects", "team", {
			displayName: "Old",
			...{ updatedAt: 100, replay: true },
		});
		expect(
			getTagFolderSettings(h.db, "projects", "alice")[0]?.displayName,
		).toBe("New");
		deleteTagFolderSetting(ctx, "projects", "team");
		upsertTagFolderSetting(ctx, "projects", "team", {
			displayName: "Old",
			...{ updatedAt: 100, replay: true, create: true },
		});
		expect(getTagFolderSettings(h.db, "projects", "alice")).toEqual([]);
	});
	it("allows a create after deletion but never a replayed edit on an absent row", () => {
		const h = createHarness();
		const ctx = { ...h, userId: "alice" };
		deleteTagFolderSetting(ctx, "projects", "team");
		const future = Date.now() + 1000;
		upsertTagFolderSetting(ctx, "projects", "team", {
			displayName: "Old",
			...{ updatedAt: future, replay: true },
		});
		expect(getTagFolderSettings(h.db, "projects", "alice")).toEqual([]);
		upsertTagFolderSetting(ctx, "projects", "team", {
			displayName: "Created",
			...{ updatedAt: future, replay: true, create: true },
		});
		expect(
			getTagFolderSettings(h.db, "projects", "alice")[0]?.displayName,
		).toBe("Created");
	});
});

it("an offline create edited after deletion cannot reuse its newer edit date", () => {
	const h = createHarness();
	const ctx = { ...h, userId: "alice" };
	const createdAt = Date.now() - 1000;
	deleteTagFolderSetting(ctx, "projects", "team");
	upsertTagFolderSetting(ctx, "projects", "team", {
		displayName: "Old edited",
		updatedAt: Date.now() + 1000,
		createdAt,
		replay: true,
		create: true,
	});
	expect(getTagFolderSettings(h.db, "projects", "alice")).toEqual([]);
});
it("sessions keep their legacy write semantics when a client supplies a date", () => {
	const h = createHarness();
	const ctx = { ...h, userId: "alice" };
	upsertTagFolderSetting(ctx, "sessions", "team", {
		displayName: "First",
		updatedAt: 200,
	});
	upsertTagFolderSetting(ctx, "sessions", "team", {
		displayName: "Second",
		updatedAt: 100,
	});
	expect(getTagFolderSettings(h.db, "sessions", "alice")[0]?.displayName).toBe(
		"Second",
	);
});
it("deletion tombstones and replay never cross users", () => {
	const h = createHarness();
	deleteTagFolderSetting({ ...h, userId: "alice" }, "projects", "team");
	upsertTagFolderSetting({ ...h, userId: "bob" }, "projects", "team", {
		displayName: "Bob",
		updatedAt: 100,
		create: true,
		replay: true,
	});
	expect(getTagFolderSettings(h.db, "projects", "bob")[0]?.displayName).toBe(
		"Bob",
	);
	expect(getTagFolderSettings(h.db, "projects", "alice")).toEqual([]);
});

it("client deletion dates block creates from an author ahead of the host clock", () => {
	const h = createHarness();
	const ctx = { ...h, userId: "alice" };
	const createdAt = Date.now() + 300_000;
	deleteTagFolderSetting(ctx, "projects", "team", createdAt + 1);
	upsertTagFolderSetting(ctx, "projects", "team", {
		displayName: "Stale",
		updatedAt: createdAt,
		createdAt,
		create: true,
		replay: true,
	});
	expect(getTagFolderSettings(h.db, "projects", "alice")).toEqual([]);
});
it("a dated deletion does not remove a newer recreation", () => {
	const h = createHarness();
	const ctx = { ...h, userId: "alice" };
	const deletedAt = Date.now() - 1000;
	upsertTagFolderSetting(ctx, "projects", "team", {
		displayName: "Recreated",
		updatedAt: deletedAt + 1,
	});
	deleteTagFolderSetting(ctx, "projects", "team", deletedAt);
	expect(getTagFolderSettings(h.db, "projects", "alice")[0]?.displayName).toBe(
		"Recreated",
	);
});
it("a delayed deletion retains its author date so a later queued creation wins", () => {
	const h = createHarness();
	const ctx = { ...h, userId: "alice" };
	const deletedAt = Date.now() - 2000;
	deleteTagFolderSetting(ctx, "projects", "team", deletedAt);
	upsertTagFolderSetting(ctx, "projects", "team", {
		displayName: "Later",
		updatedAt: deletedAt + 1,
		create: true,
		replay: true,
	});
	expect(getTagFolderSettings(h.db, "projects", "alice")[0]?.displayName).toBe(
		"Later",
	);
});
it("project writes bound each user's deletion history without evicting another user's history", () => {
	const h = createHarness();
	h.db
		.insert(schema.projectCollectionDeletions)
		.values(
			Array.from({ length: 1025 }, (_, i) => ({
				tag: `old-${i}`,
				createdByUserId: "alice",
				deletedAt: i,
			})),
		)
		.run();
	h.db
		.insert(schema.projectCollectionDeletions)
		.values({ tag: "bob", createdByUserId: "bob", deletedAt: 0 })
		.run();
	upsertTagFolderSetting({ ...h, userId: "alice" }, "projects", "live", {
		displayName: "Live",
	});
	const rows = h.db.select().from(schema.projectCollectionDeletions).all();
	expect(rows.filter((row) => row.createdByUserId === "alice")).toHaveLength(
		1024,
	);
	expect(rows.some((row) => row.tag === "old-0")).toBe(false);
	expect(rows.some((row) => row.tag === "bob")).toBe(true);
	deleteTagFolderSetting({ ...h, userId: "alice" }, "projects", "live");
	expect(
		h.db
			.select()
			.from(schema.projectCollectionDeletions)
			.all()
			.filter((row) => row.createdByUserId === "alice"),
	).toHaveLength(1024);
});
