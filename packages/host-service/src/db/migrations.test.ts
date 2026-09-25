import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

/**
 * createDb runs on better-sqlite3, which Bun cannot load. bun:sqlite drives
 * the identical code path (both are sync sessions on SQLiteSyncDialect), so
 * these arms reproduce what a real host.db does.
 */

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

/**
 * The two migrations HOST-SERVICE-53/54 came in without. A build carrying
 * 0028 but neither of these — a branch cut before they merged — leaves the
 * watermark above both, and drizzle's migrator never runs them again.
 */
const LOST = ["0026_workspace_tags", "0027_workspace_tag_settings"];
const LAST_SHIPPED_WITH_THEM_LOST = "0028_funny_gideon";

type Journal = {
	entries: { idx: number; version: string; when: number; tag: string }[];
};

function readJournal(folder: string): Journal {
	return JSON.parse(
		readFileSync(join(folder, "meta/_journal.json"), "utf8"),
	) as Journal;
}

const tempDirs: string[] = [];

/** The real migration folder, minus `omit`, truncated after `through`. */
function folderWithout(options: { omit: string[]; through: string }): string {
	const journal = readJournal(MIGRATIONS_FOLDER);
	const end = journal.entries.findIndex(
		(entry) => entry.tag === options.through,
	);
	expect(end).toBeGreaterThan(-1);
	const entries = journal.entries
		.slice(0, end + 1)
		.filter((entry) => !options.omit.includes(entry.tag));

	const dir = mkdtempSync(join(tmpdir(), "host-migrations-"));
	tempDirs.push(dir);
	mkdirSync(join(dir, "meta"));
	for (const entry of entries) {
		copyFileSync(
			join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
			join(dir, `${entry.tag}.sql`),
		);
	}
	writeFileSync(
		join(dir, "meta/_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries }),
	);
	return dir;
}

function open(): Database {
	const sqlite = new Database(":memory:");
	// What createDb does while migrating, for the same reason.
	sqlite.exec("PRAGMA foreign_keys = OFF");
	return sqlite;
}

function tables(sqlite: Database): string[] {
	return (
		sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all() as { name: string }[]
	).map((row) => row.name);
}

describe("host.db migrations", () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("drizzle's migrator cannot recover a database that lost them", () => {
		const sqlite = open();
		migrate(drizzle(sqlite), {
			migrationsFolder: folderWithout({
				omit: LOST,
				through: LAST_SHIPPED_WITH_THEM_LOST,
			}),
		});
		expect(tables(sqlite)).not.toContain("workspace_tags");

		// Every later release carries both, and both stay below the watermark.
		// 0029 reads workspace_tag_settings to fold it into tag_folder_settings,
		// so from that release on the host-service cannot even start: createDb
		// lets a failed migration throw rather than serve a half-migrated DB.
		expect(() =>
			migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_FOLDER }),
		).toThrow("workspace_tag_settings");
	});

	test("the runner heals a database that lost them", () => {
		const sqlite = open();
		migrate(drizzle(sqlite), {
			migrationsFolder: folderWithout({
				omit: LOST,
				through: LAST_SHIPPED_WITH_THEM_LOST,
			}),
		});

		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		// workspace.list and project.list read these two.
		expect(tables(sqlite)).toContain("workspace_tags");
		expect(tables(sqlite)).toContain("tag_folder_settings");
		expect(() =>
			sqlite.prepare("SELECT * FROM workspace_tags").all(),
		).not.toThrow();
	});

	test("the runner applies the whole set to a fresh database", () => {
		const sqlite = open();

		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		expect(tables(sqlite)).toContain("workspaces");
		expect(tables(sqlite)).toContain("workspace_tags");
		expect(tables(sqlite)).toContain("tag_folder_settings");
	});

	test("every shipped journal entry has a distinct `when`", () => {
		// The runner identifies applied migrations by `when`. Two entries sharing
		// one would let a real migration be mistaken for an applied one.
		const whens = readJournal(MIGRATIONS_FOLDER).entries.map(
			(entry) => entry.when,
		);

		expect(new Set(whens).size).toBe(whens.length);
	});
});

describe("0036_dedupe_project_repo_path", () => {
	const KEEP = "11111111-1111-4111-8111-111111111111";
	const DUP = "22222222-2222-4222-8222-222222222222";
	const OTHER = "33333333-3333-4333-8333-333333333333";
	const REPO = "/Users/me/code/app";

	function seedThrough0035(): Database {
		const sqlite = open();
		migrate(drizzle(sqlite), {
			migrationsFolder: folderWithout({
				omit: [],
				through: "0035_local_workspaces",
			}),
		});
		const insertProject = sqlite.prepare(
			"INSERT INTO projects (id, repo_path, created_at) VALUES (?, ?, ?)",
		);
		// The v1 importer wrote the twin ~30s after the original (#7702).
		insertProject.run(KEEP, REPO, 1_000);
		insertProject.run(DUP, REPO, 31_000);
		insertProject.run(OTHER, "/Users/me/code/other", 2_000);
		const insertWorkspace = sqlite.prepare(
			"INSERT INTO workspaces (id, project_id, worktree_path, branch, type, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		);
		insertWorkspace.run(
			"ws-keep",
			KEEP,
			`${REPO}/.worktrees/a`,
			"a",
			"worktree",
			1,
		);
		insertWorkspace.run("ws-dup", DUP, REPO, "main", "local", 2);
		insertWorkspace.run(
			"ws-other",
			OTHER,
			"/Users/me/code/other",
			"main",
			"local",
			3,
		);
		insertWorkspace.run(
			"ws-session",
			null,
			"/tmp/session",
			"main",
			"session",
			4,
		);
		sqlite
			.prepare(
				"INSERT INTO pull_requests (id, project_id, repo_provider, repo_owner, repo_name, pr_number, url, title, state, head_branch, head_sha, created_at, updated_at) VALUES (?, ?, 'github', 'me', 'app', 7, 'u', 't', 'open', 'a', 'sha', 1, 1)",
			)
			.run("pr-dup", DUP);
		sqlite
			.prepare(
				"INSERT INTO tag_folder_settings (scope, tag, created_by_user_id, updated_at) VALUES (?, 'bugs', '', 1)",
			)
			.run(DUP);
		return sqlite;
	}

	test("folds twin project rows into the oldest and moves their children", () => {
		const sqlite = seedThrough0035();

		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		const projectIds = (
			sqlite.prepare("SELECT id FROM projects ORDER BY id").all() as {
				id: string;
			}[]
		).map((row) => row.id);
		expect(projectIds).toEqual([KEEP, OTHER]);

		const workspaces = sqlite
			.prepare("SELECT id, project_id FROM workspaces ORDER BY id")
			.all() as { id: string; project_id: string | null }[];
		expect(workspaces).toEqual([
			{ id: "ws-dup", project_id: KEEP },
			{ id: "ws-keep", project_id: KEEP },
			{ id: "ws-other", project_id: OTHER },
			{ id: "ws-session", project_id: null },
		]);
		expect(
			sqlite.prepare("SELECT project_id FROM pull_requests").get(),
		).toEqual({ project_id: KEEP });
		expect(
			sqlite.prepare("SELECT count(*) AS n FROM tag_folder_settings").get(),
		).toEqual({ n: 0 });
		expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
	});

	test("leaves a row whose project row is already gone alone", () => {
		const sqlite = seedThrough0035();
		// The runner tolerates legacy orphans (connections that never enabled
		// enforcement wrote them); the dedupe must not turn one into a NOT NULL
		// violation that bricks startup, nor silently orphan a workspace.
		sqlite
			.prepare(
				"INSERT INTO pull_requests (id, project_id, repo_provider, repo_owner, repo_name, pr_number, url, title, state, head_branch, head_sha, created_at, updated_at) VALUES (?, 'ghost', 'github', 'me', 'app', 9, 'u', 't', 'open', 'a', 'sha', 1, 1)",
			)
			.run("pr-orphan");
		sqlite
			.prepare(
				"INSERT INTO workspaces (id, project_id, worktree_path, branch, type, created_at) VALUES (?, 'ghost', '/tmp/orphan', 'main', 'local', 5)",
			)
			.run("ws-orphan");

		expect(() =>
			runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER),
		).not.toThrow();

		expect(
			sqlite
				.prepare("SELECT project_id FROM pull_requests WHERE id = 'pr-orphan'")
				.get(),
		).toEqual({ project_id: "ghost" });
		expect(
			sqlite
				.prepare("SELECT project_id FROM workspaces WHERE id = 'ws-orphan'")
				.get(),
		).toEqual({ project_id: "ghost" });
	});

	test("folds three rows on one path, not just a pair", () => {
		const sqlite = seedThrough0035();
		sqlite
			.prepare(
				"INSERT INTO projects (id, repo_path, created_at) VALUES (?, ?, ?)",
			)
			.run("44444444-4444-4444-8444-444444444444", REPO, 61_000);

		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		expect(
			sqlite.prepare("SELECT id FROM projects WHERE repo_path = ?").all(REPO),
		).toEqual([{ id: KEEP }]);
	});

	test("a second project on the same repo path is rejected afterwards", () => {
		const sqlite = seedThrough0035();
		runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);

		expect(() =>
			sqlite
				.prepare(
					"INSERT INTO projects (id, repo_path, created_at) VALUES ('new', ?, 5)",
				)
				.run(REPO),
		).toThrow(/UNIQUE/);
	});
});
