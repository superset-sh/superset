import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { SimpleGit } from "simple-git";
import * as schema from "../../../../db/schema";
import { hostSettings } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { LocalProject } from "../shared/local-project";
import { resolveProjectBranchPrefix } from "./branch-prefix";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");

function createTestDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

type TestDb = ReturnType<typeof createTestDb>;

/** Git stub whose `user.name` is fixed — only the `author` mode reads it. */
function gitWithAuthor(authorName: string | null): SimpleGit {
	return {
		getConfig: async () => ({ value: authorName }),
	} as unknown as SimpleGit;
}

function makeProject(overrides: Partial<LocalProject>): LocalProject {
	return {
		id: "00000000-0000-0000-0000-000000000000",
		repoPath: "/tmp/repo",
		branchPrefixMode: null,
		branchPrefixCustom: null,
		...overrides,
	} as LocalProject;
}

function makeCtx(db: TestDb): HostServiceContext {
	return { db } as unknown as HostServiceContext;
}

function setGlobal(
	db: TestDb,
	mode: BranchPrefixMode | null,
	customPrefix: string | null,
) {
	db.insert(hostSettings)
		.values({ id: 1, branchPrefixMode: mode, branchPrefixCustom: customPrefix })
		.run();
}

describe("resolveProjectBranchPrefix", () => {
	it("returns undefined when nothing is configured", async () => {
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(createTestDb()),
			project: makeProject({}),
			git: gitWithAuthor(null),
			existingBranches: [],
		});
		expect(result).toBeUndefined();
	});

	it("falls back to the host-wide default", async () => {
		const db = createTestDb();
		setGlobal(db, "custom", "team");
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(db),
			project: makeProject({}),
			git: gitWithAuthor(null),
			existingBranches: [],
		});
		expect(result).toBe("team");
	});

	it("project override wins over the host-wide default", async () => {
		const db = createTestDb();
		setGlobal(db, "custom", "team");
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(db),
			project: makeProject({
				branchPrefixMode: "custom",
				branchPrefixCustom: "proj",
			}),
			git: gitWithAuthor(null),
			existingBranches: [],
		});
		expect(result).toBe("proj");
	});

	it("a null project mode inherits the host-wide default", async () => {
		const db = createTestDb();
		setGlobal(db, "custom", "team");
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(db),
			// branchPrefixCustom set but mode null — must NOT count as an override.
			project: makeProject({ branchPrefixCustom: "stale" }),
			git: gitWithAuthor(null),
			existingBranches: [],
		});
		expect(result).toBe("team");
	});

	it("a project `none` override suppresses the host-wide default", async () => {
		const db = createTestDb();
		setGlobal(db, "custom", "team");
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(db),
			project: makeProject({ branchPrefixMode: "none" }),
			git: gitWithAuthor(null),
			existingBranches: [],
		});
		expect(result).toBeUndefined();
	});

	it("drops the prefix when it collides with an existing branch", async () => {
		const db = createTestDb();
		setGlobal(db, "custom", "team");
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(db),
			project: makeProject({}),
			git: gitWithAuthor(null),
			existingBranches: ["main", "Team"],
		});
		expect(result).toBeUndefined();
	});

	it("resolves the `author` mode from git user.name", async () => {
		const result = await resolveProjectBranchPrefix({
			ctx: makeCtx(createTestDb()),
			project: makeProject({ branchPrefixMode: "author" }),
			git: gitWithAuthor("Jane Doe"),
			existingBranches: [],
		});
		expect(result).toBe("Jane-Doe");
	});
});
