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
