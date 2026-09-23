import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	projectFolders,
	projectGroupMembers,
	projectGroups,
	projects,
} from "../db/schema";
import { runProjectGroupBackfill } from "./project-group-backfill";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = OFF");
	const rawDb = drizzle(sqlite, { schema });
	migrate(rawDb, { migrationsFolder: MIGRATIONS_FOLDER });
	sqlite.run("PRAGMA foreign_keys = ON");
	return rawDb as unknown as HostDb;
}

function insertProject(
	db: HostDb,
	values: {
		repoPath: string;
		name?: string;
		icon?: string | null;
		color?: string | null;
	},
): string {
	const id = randomUUID();
	db.insert(projects)
		.values({
			id,
			repoPath: values.repoPath,
			name: values.name ?? "",
			icon: values.icon ?? null,
			color: values.color ?? null,
			updatedAt: 1,
		})
		.run();
	return id;
}

function countRows(db: HostDb) {
	return {
		groups: db.select().from(projectGroups).all().length,
		members: db.select().from(projectGroupMembers).all().length,
		projects: db.select().from(projects).all().length,
	};
}

describe("project group backfill", () => {
	it("gives a project with no folder rows a group holding it alone", () => {
		const db = createDb();
		const projectId = insertProject(db, {
			repoPath: "/home/me/code/api",
			name: "API",
			icon: "data:image/png;base64,aa",
			color: "#ff0000",
		});

		expect(runProjectGroupBackfill({ db })).toEqual({ groups: 1, members: 1 });

		const group = db.select().from(projectGroups).all()[0];
		expect(group?.name).toBe("API");
		expect(group?.icon).toBe("data:image/png;base64,aa");
		expect(group?.color).toBe("#ff0000");
		expect(db.select().from(projectGroupMembers).all()).toMatchObject([
			{ groupId: group?.id, projectId, position: 0, folder: "api" },
		]);
	});

	it("names the group after the repo directory when the project is unnamed", () => {
		const db = createDb();
		insertProject(db, { repoPath: "/home/me/code/web" });

		runProjectGroupBackfill({ db });

		expect(db.select().from(projectGroups).all()[0]?.name).toBe("web");
	});

	it("builds members from the project's folders, resolving each to a project", () => {
		const db = createDb();
		const primary = insertProject(db, {
			repoPath: "/home/me/code/api",
			name: "API",
		});
		const secondary = insertProject(db, {
			repoPath: "/home/me/code/web",
			name: "Web",
		});
		const now = Date.now();
		db.insert(projectFolders)
			.values([
				{
					id: randomUUID(),
					projectId: primary,
					position: 0,
					folder: "api",
					repoPath: "/home/me/code/api",
					baseBranch: "main",
					createdAt: now,
					updatedAt: now,
				},
				{
					id: randomUUID(),
					projectId: primary,
					position: 1,
					folder: "web",
					repoPath: "/home/me/code/web",
					baseBranch: "develop",
					createdAt: now,
					updatedAt: now,
				},
			])
			.run();

		runProjectGroupBackfill({ db });

		const group = db
			.select()
			.from(projectGroups)
			.all()
			.find((row) => row.name === "API");
		const members = db
			.select()
			.from(projectGroupMembers)
			.all()
			.filter((row) => row.groupId === group?.id)
			.sort((a, b) => a.position - b.position);
		expect(members).toMatchObject([
			{ projectId: primary, position: 0, folder: "api", baseBranch: "main" },
			{
				projectId: secondary,
				position: 1,
				folder: "web",
				baseBranch: "develop",
			},
		]);
	});

	it("skips a folder whose checkout is not a project on this host", () => {
		const db = createDb();
		const primary = insertProject(db, {
			repoPath: "/home/me/code/api",
			name: "API",
		});
		const now = Date.now();
		db.insert(projectFolders)
			.values([
				{
					id: randomUUID(),
					projectId: primary,
					position: 0,
					folder: "api",
					repoPath: "/home/me/code/api",
					createdAt: now,
					updatedAt: now,
				},
				{
					id: randomUUID(),
					projectId: primary,
					position: 1,
					folder: "unknown",
					repoUrl: "https://github.com/acme/unknown",
					createdAt: now,
					updatedAt: now,
				},
			])
			.run();

		expect(runProjectGroupBackfill({ db })).toEqual({ groups: 1, members: 1 });
		expect(db.select().from(projectGroupMembers).all()).toMatchObject([
			{ projectId: primary, position: 0, folder: "api" },
		]);
	});

	it("is idempotent: a second run changes nothing", () => {
		const db = createDb();
		insertProject(db, { repoPath: "/home/me/code/api", name: "API" });
		insertProject(db, { repoPath: "/home/me/code/web", name: "Web" });

		const first = runProjectGroupBackfill({ db });
		const afterFirst = countRows(db);
		const second = runProjectGroupBackfill({ db });

		expect(first).toEqual({ groups: 2, members: 2 });
		expect(second).toEqual({ groups: 0, members: 0 });
		expect(countRows(db)).toEqual(afterFirst);
	});

	it("groups only the projects that have no membership yet", () => {
		const db = createDb();
		insertProject(db, { repoPath: "/home/me/code/api", name: "API" });
		runProjectGroupBackfill({ db });

		insertProject(db, { repoPath: "/home/me/code/web", name: "Web" });
		expect(runProjectGroupBackfill({ db })).toEqual({ groups: 1, members: 1 });
		expect(countRows(db)).toEqual({ groups: 2, members: 2, projects: 2 });
	});
});
