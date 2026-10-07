import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { persistLocalProject } from "./persist-project";

let sqlite: Database;
let db: HostDb;
let ctx: HostServiceContext;
let events: unknown[];
beforeEach(() => {
	sqlite = new Database(":memory:");
	const database = drizzle(sqlite, { schema });
	migrate(database, {
		migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
	});
	db = database as unknown as HostDb;
	events = [];
	ctx = {
		db,
		eventBus: {
			broadcastProjectChanged: (event: unknown) => events.push(event),
		},
	} as unknown as HostServiceContext;
});
afterEach(() => sqlite.close());

const native = (provider: "gitlab" | "unknown" = "gitlab") => ({
	repoPath: "/tmp/owned-project/Widget",
	parsed: null,
	remoteName: null,
	identity: {
		provider,
		host: "git.example.invalid:8443",
		owner: "Group/SubGroup",
		name: "Widget",
		url: "https://git.example.invalid:8443/Group/SubGroup/Widget",
		remoteName: "upstream",
	},
});

test("persists native canonical host, subgroup case and selected remote without fabricating GitHub", () => {
	persistLocalProject(ctx, randomUUID(), native(), { name: "Native" });
	expect(db.select().from(projects).get()).toMatchObject({
		repoProvider: "gitlab",
		repoOwner: "Group/SubGroup",
		repoName: "Widget",
		repoUrl: "https://git.example.invalid:8443/Group/SubGroup/Widget",
		remoteName: "upstream",
		name: "Native",
	});
	expect(events).toHaveLength(1);
});

test("an unknown provider preserves canonical repository metadata with null provider", () => {
	persistLocalProject(ctx, randomUUID(), native("unknown"));
	expect(db.select().from(projects).get()).toMatchObject({
		repoProvider: null,
		repoOwner: "Group/SubGroup",
		repoName: "Widget",
		repoUrl: "https://git.example.invalid:8443/Group/SubGroup/Widget",
		remoteName: "upstream",
	});
});

test("retains the original GitHub mapping and default folder name", () => {
	persistLocalProject(ctx, randomUUID(), {
		repoPath: "/tmp/owned-project/GH",
		remoteName: "origin",
		parsed: {
			provider: "github",
			owner: "Owner",
			name: "Repo",
			url: "https://github.com/Owner/Repo",
		},
	});
	expect(db.select().from(projects).get()).toMatchObject({
		name: "GH",
		repoProvider: "github",
		repoOwner: "Owner",
		repoName: "Repo",
		repoUrl: "https://github.com/Owner/Repo",
		remoteName: "origin",
	});
});

test("a local-only folder retains all original null repository fields", () => {
	persistLocalProject(ctx, randomUUID(), {
		repoPath: "/tmp/owned-project/Local",
		parsed: null,
		remoteName: null,
	});
	expect(db.select().from(projects).get()).toMatchObject({
		name: "Local",
		repoProvider: null,
		repoOwner: null,
		repoName: null,
		repoUrl: null,
		remoteName: null,
	});
});

test("native updates keep the same UUID and existing customizations and emit updated", () => {
	const id = randomUUID();
	db.insert(projects)
		.values({
			id,
			repoPath: "/tmp/old",
			name: "Custom",
			color: "#112233",
			icon: "none",
		})
		.run();
	persistLocalProject(ctx, id, native());
	expect(db.select().from(projects).all()).toHaveLength(1);
	expect(db.select().from(projects).get()).toMatchObject({
		id,
		name: "Custom",
		icon: "none",
		color: "#112233",
		repoProvider: "gitlab",
		repoPath: native().repoPath,
	});
	expect(events[0]).toMatchObject({ projectId: id, eventType: "updated" });
});
