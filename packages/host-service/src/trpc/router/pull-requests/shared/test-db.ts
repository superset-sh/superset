import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { projects, pullRequests, workspaces } from "../../../../db/schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");

export function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

export const PROJECT_ID = "project-1";
export const PR_NUMBER = 42;
/** A PR the host has a row for but no live workspace is on. */
export const UNLINKED_PR_NUMBER = 43;
export const REPO = { owner: "octocat", name: "hello" };

/**
 * One project with PR #42 linked from two live workspaces (most recent
 * activity first: ws-newer, ws-older), one archived workspace still pointing
 * at it, one unlinked workspace, and PR #43 with a row but no links.
 */
export function seedLinkedPullRequest(
	db: HostDb,
	repoPath = "/tmp/repo",
	options: { rowProjectId?: string; isDraft?: boolean } = {},
) {
	const rowProjectId = options.rowProjectId ?? PROJECT_ID;
	db.insert(projects).values({ id: PROJECT_ID, repoPath }).run();
	if (rowProjectId !== PROJECT_ID) {
		db.insert(projects)
			.values({ id: rowProjectId, repoPath: `${repoPath}-sibling` })
			.run();
	}
	db.insert(pullRequests)
		.values([
			pullRequestRow("pr-42", rowProjectId, REPO, PR_NUMBER, options.isDraft),
			pullRequestRow("pr-43", rowProjectId, REPO, UNLINKED_PR_NUMBER),
		])
		.run();
	db.insert(workspaces)
		.values([
			workspaceRow("ws-older", repoPath, "pr-42", { lastActivityAt: 1 }),
			// Activity, not metadata, decides recency: the older row has the
			// newer updatedAt.
			workspaceRow("ws-newer", repoPath, "pr-42", {
				lastActivityAt: 2,
				updatedAt: 1,
			}),
			workspaceRow("ws-archived", repoPath, "pr-42", {
				lastActivityAt: 3,
				archivedAt: 1_700_000_000_000,
			}),
			workspaceRow("ws-unlinked", repoPath, null, { lastActivityAt: 4 }),
		])
		.run();
}

/**
 * A second row for PR #42 under the repository spelled with different
 * casing, as a sibling project that resolved its remote differently would
 * write, linked from one live workspace.
 */
export function seedDuplicateCasingRow(db: HostDb, repoPath = "/tmp/repo") {
	db.insert(pullRequests)
		.values(
			pullRequestRow(
				"pr-42-dup",
				PROJECT_ID,
				{ owner: "OctoCat", name: "Hello" },
				PR_NUMBER,
			),
		)
		.run();
	db.insert(workspaces)
		.values(
			workspaceRow("ws-dup", repoPath, "pr-42-dup", { lastActivityAt: 5 }),
		)
		.run();
}

export function readPullRequestRow(db: HostDb, id = "pr-42") {
	return db
		.select({
			state: pullRequests.state,
			mergedAt: pullRequests.mergedAt,
			projectId: pullRequests.projectId,
		})
		.from(pullRequests)
		.where(eq(pullRequests.id, id))
		.get();
}

function pullRequestRow(
	id: string,
	projectId: string,
	repo: { owner: string; name: string },
	prNumber: number,
	isDraft = false,
) {
	return {
		id,
		projectId,
		repoProvider: "github",
		repoOwner: repo.owner,
		repoName: repo.name,
		prNumber,
		url: `https://github.com/${repo.owner}/${repo.name}/pull/${prNumber}`,
		title: `PR ${prNumber}`,
		state: isDraft ? "draft" : "open",
		isDraft,
		headBranch: `feature/${prNumber}`,
		headSha: `sha-${prNumber}`,
	};
}

function workspaceRow(
	id: string,
	repoPath: string,
	pullRequestId: string | null,
	fields: {
		lastActivityAt: number;
		updatedAt?: number;
		archivedAt?: number;
	},
) {
	return {
		id,
		projectId: PROJECT_ID,
		worktreePath: `${repoPath}-${id}`,
		branch: pullRequestId ? "feature/42" : "main",
		pullRequestId,
		createdAt: fields.lastActivityAt,
		updatedAt: fields.updatedAt ?? fields.lastActivityAt,
		lastActivityAt: fields.lastActivityAt,
		archivedAt: fields.archivedAt ?? null,
	};
}
