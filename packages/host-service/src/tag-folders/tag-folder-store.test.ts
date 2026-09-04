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
		expect(getTagFolderSettings(h.db, PROJECT)).toEqual([
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
		expect(getTagFolderSettings(h.db, PROJECT)).toEqual([]);
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
		expect(getTagFolderSettings(h.db, SESSIONS_TAG_SCOPE)).toEqual([
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
		expect(getTagFolderSettings(h.db, PROJECT)[0]?.color).toBe("#ff0000");
		expect(getTagFolderSettings(h.db, SESSIONS_TAG_SCOPE)[0]?.color).toBe(
			"#0000ff",
		);
	});
});
