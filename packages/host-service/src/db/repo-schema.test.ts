import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { applyRepoSchema } from "./repo-schema";

const databases: Database[] = [];
const migrations = resolve(import.meta.dir, "../../drizzle");

function upstream() {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	runMigrations(drizzle(sqlite), migrations);
	sqlite.exec(
		"INSERT INTO projects (id, repo_path, created_at) VALUES ('project', '/repo', 1)",
	);
	return sqlite;
}

function insert(
	sqlite: Database,
	id: string,
	provider: string,
	url: string,
	host?: string,
) {
	const columns = host === undefined ? "" : ", repo_host";
	const value = host === undefined ? "" : ", ?";
	sqlite
		.prepare(
			`INSERT INTO pull_requests (id, project_id, repo_provider, repo_owner, repo_name, pr_number, url, title, state, head_branch, head_sha, created_at, updated_at${columns})
		 VALUES (?, 'project', ?, 'team', 'repo', 1, ?, 'title', 'open', 'feature', 'sha', 1, 1${value})`,
		)
		.run(...[id, provider, url, ...(host === undefined ? [] : [host])]);
}

describe("instance-scoped repository schema", () => {
	afterEach(() => {
		for (const sqlite of databases.splice(0)) sqlite.close();
	});

	it("permits identical merge request numbers on two GitLab instances", () => {
		const sqlite = upstream();
		applyRepoSchema(sqlite);
		insert(
			sqlite,
			"a",
			"gitlab",
			"https://a.example/team/repo/-/merge_requests/1",
			"a.example",
		);
		insert(
			sqlite,
			"b",
			"gitlab",
			"https://b.example:8443/team/repo/-/merge_requests/1",
			"b.example:8443",
		);
		expect(sqlite.prepare("SELECT id FROM pull_requests").all()).toHaveLength(
			2,
		);
		expect(() =>
			insert(
				sqlite,
				"duplicate",
				"gitlab",
				"https://a.example/team/repo/-/merge_requests/1",
				"a.example",
			),
		).toThrow();
	});

	it("backfills existing instance identity from the stored URL and preserves review metadata", () => {
		const sqlite = upstream();
		insert(
			sqlite,
			"legacy",
			"gitlab",
			"https://GL.example:8443/team/repo/-/merge_requests/1",
		);
		sqlite.exec("ALTER TABLE pull_requests ADD review_state_json text");
		sqlite
			.prepare(
				"UPDATE pull_requests SET review_state_json = ? WHERE id = 'legacy'",
			)
			.run('{"provider":"gitlab","approvedBy":["alice"]}');
		applyRepoSchema(sqlite);
		const row = sqlite
			.prepare(
				"SELECT repo_host, review_state_json FROM pull_requests WHERE id = 'legacy'",
			)
			.get();
		expect(row).toEqual({
			repo_host: "gl.example:8443",
			review_state_json: '{"provider":"gitlab","approvedBy":["alice"]}',
		});
	});

	it("keeps GitHub defaults and all upstream migration records across repeated startup", () => {
		const sqlite = upstream();
		insert(sqlite, "legacy", "github", "https://github.com/team/repo/pull/1");
		const before = sqlite.prepare("SELECT * FROM __drizzle_migrations").all();
		applyRepoSchema(sqlite);
		applyRepoSchema(sqlite);
		expect(
			sqlite
				.prepare("SELECT repo_host FROM pull_requests WHERE id = 'legacy'")
				.get(),
		).toEqual({ repo_host: "github.com" });
		expect(sqlite.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(
			before,
		);
	});

	it("leaves a GitLab row with an invalid URL unassigned instead of treating it as GitHub", () => {
		const sqlite = upstream();
		insert(sqlite, "legacy", "gitlab", "invalid");
		applyRepoSchema(sqlite);
		expect(
			sqlite
				.prepare("SELECT repo_host FROM pull_requests WHERE id = 'legacy'")
				.get(),
		).toEqual({ repo_host: "" });
	});
});
