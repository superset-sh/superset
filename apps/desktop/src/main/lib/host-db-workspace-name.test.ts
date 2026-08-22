import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWorkspaceNameFromHostDbs } from "./host-db-workspace-name";

const openReadonly = (path: string) =>
	new Database(path, { readonly: true, create: false });

function seedHostDb(
	root: string,
	orgId: string,
	rows: Array<{ worktreePath: string; name: string }>,
) {
	mkdirSync(join(root, orgId), { recursive: true });
	const db = new Database(join(root, orgId, "host.db"));
	db.run(
		"CREATE TABLE workspaces (id TEXT PRIMARY KEY, worktree_path TEXT NOT NULL, name TEXT NOT NULL DEFAULT '')",
	);
	for (const [i, row] of rows.entries()) {
		db.run(
			"INSERT INTO workspaces (id, worktree_path, name) VALUES (?, ?, ?)",
			[`${orgId}-${i}`, row.worktreePath, row.name],
		);
	}
	db.close();
}

describe("getWorkspaceNameFromHostDbs", () => {
	let root: string;
	const worktreePath =
		"/Users/me/.superset/worktrees/proj/silky-ophthalmologist";

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "host-db-workspace-name-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("returns undefined when the host root does not exist", () => {
		expect(
			getWorkspaceNameFromHostDbs(
				worktreePath,
				openReadonly,
				join(root, "missing"),
			),
		).toBeUndefined();
	});

	it("returns the renamed title for the worktree path from any org DB", () => {
		seedHostDb(root, "org-a", [{ worktreePath: "/elsewhere", name: "Other" }]);
		seedHostDb(root, "org-b", [
			{ worktreePath, name: "Fix setup rename race" },
		]);
		expect(getWorkspaceNameFromHostDbs(worktreePath, openReadonly, root)).toBe(
			"Fix setup rename race",
		);
	});

	it("returns undefined when the host root cannot be enumerated", () => {
		// A regular file exists but is not a directory: readdirSync throws ENOTDIR
		// regardless of the user's privileges.
		const notADir = join(root, "not-a-dir");
		writeFileSync(notADir, "");
		expect(
			getWorkspaceNameFromHostDbs(worktreePath, openReadonly, notADir),
		).toBeUndefined();
	});

	it("skips unreadable DBs, stray files, and blank names", () => {
		mkdirSync(join(root, "broken"));
		writeFileSync(join(root, "broken", "host.db"), "not a sqlite file");
		writeFileSync(join(root, "stray-file"), "");
		seedHostDb(root, "org-a", [{ worktreePath, name: "   " }]);
		expect(
			getWorkspaceNameFromHostDbs(worktreePath, openReadonly, root),
		).toBeUndefined();
	});
});
