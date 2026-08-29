import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { ProjectChangedMessage } from "../events/types";
import {
	deleteTagSetting,
	getProjectTagSettings,
	upsertTagSetting,
} from "./local-project-store";

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
	const messages: ProjectChangedMessage[] = [];
	const eventBus = {
		broadcastProjectChanged: (message: Omit<ProjectChangedMessage, "type">) => {
			messages.push({ type: "project:changed", ...message });
		},
	} as unknown as EventBus;
	return { db, eventBus, messages };
}

describe("workspace tag settings store", () => {
	it("creates on first customisation and merge-upserts after", () => {
		const h = createHarness();
		upsertTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, " Perf ", {
			displayName: "Perf Work",
		});
		upsertTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf", {
			color: "#ff0000",
		});
		expect(getProjectTagSettings(h.db, PROJECT)).toEqual([
			{
				tag: "perf",
				displayName: "Perf Work",
				color: "#ff0000",
				tabOrder: null,
			},
		]);
		// Every write broadcasts the project with the fresh settings attached.
		expect(h.messages.at(-1)?.project?.tagSettings).toEqual([
			{
				tag: "perf",
				displayName: "Perf Work",
				color: "#ff0000",
				tabOrder: null,
			},
		]);
	});

	it("explicit null clears a field; absent keeps it", () => {
		const h = createHarness();
		upsertTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf", {
			displayName: "Perf Work",
			color: "#ff0000",
		});
		upsertTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf", {
			color: null,
		});
		expect(getProjectTagSettings(h.db, PROJECT)[0]).toMatchObject({
			displayName: "Perf Work",
			color: null,
		});
	});

	it("delete removes the row and broadcasts; idempotent", () => {
		const h = createHarness();
		upsertTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf", {
			color: "#ff0000",
		});
		deleteTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf");
		deleteTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "perf");
		expect(getProjectTagSettings(h.db, PROJECT)).toEqual([]);
		expect(h.messages.at(-1)?.project?.tagSettings).toEqual([]);
	});

	it("rejects an unnormalizable tag and an unknown project", () => {
		const h = createHarness();
		expect(
			upsertTagSetting({ db: h.db, eventBus: h.eventBus }, PROJECT, "   ", {
				color: "#f00",
			}),
		).toBeUndefined();
		expect(
			upsertTagSetting(
				{ db: h.db, eventBus: h.eventBus },
				"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				"perf",
				{ color: "#f00" },
			),
		).toBeUndefined();
		expect(h.messages).toEqual([]);
	});
});
