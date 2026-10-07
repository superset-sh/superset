import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import { applyRepoSchema } from "../../../../db/repo-schema";
import * as schema from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { syncGitLabPullRequestAfterWrite } from "./sync-gitlab-after-write";

const openDatabases: Database[] = [];
afterEach(() => {
	for (const sqlite of openDatabases.splice(0)) sqlite.close();
});
const repo = { host: "git.example.test:8443", owner: "Team/Sub", name: "Repo" };
const iid = 7;
const expectedUrl = `https://${repo.host}/${repo.owner}/${repo.name}/-/merge_requests/${iid}`;

function fixture() {
	const sqlite = new Database(":memory:");
	openDatabases.push(sqlite);
	const database = drizzle(sqlite, { schema });
	migrate(database, {
		migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
	});
	applyRepoSchema(sqlite);
	const db = database as unknown as HostDb;
	db.insert(schema.projects)
		.values({ id: "owned", repoPath: "/owned/repo" })
		.run();
	const refreshCalls: string[][] = [];
	const ctx = {
		db,
		runtime: {
			pullRequests: {
				refreshPullRequestsByWorkspaces: async (ids: string[]) => {
					refreshCalls.push(ids);
				},
			},
		},
	} as unknown as Pick<HostServiceContext, "db" | "runtime">;
	const seed = (
		id: string,
		fields: Partial<typeof schema.pullRequests.$inferInsert> = {},
	) => {
		db.insert(schema.pullRequests)
			.values({
				id,
				projectId: "owned",
				repoProvider: "gitlab",
				repoHost: repo.host,
				repoOwner: repo.owner,
				repoName: repo.name,
				prNumber: iid,
				url: expectedUrl,
				title: "Native MR",
				state: "open",
				isDraft: false,
				headBranch: "feature",
				headSha: "sha",
				updatedAt: 1,
				...fields,
			})
			.run();
	};
	const link = (
		id: string,
		pullRequestId: string | null,
		archivedAt: number | null = null,
	) => {
		db.insert(schema.workspaces)
			.values({
				id,
				projectId: "owned",
				worktreePath: "/owned/repo",
				branch: "feature",
				pullRequestId,
				archivedAt,
				createdAt: 1,
				updatedAt: 1,
			})
			.run();
	};
	const row = (id = "current") =>
		db
			.select()
			.from(schema.pullRequests)
			.where(eq(schema.pullRequests.id, id))
			.get();
	return { sqlite, db, ctx, refreshCalls, seed, link, row };
}

test("native postwrite exact provider authority port case IID and URL select only the confirmed row", async () => {
	const h = fixture();
	h.seed("current");
	h.link("current-workspace", "current");
	for (const [id, fields] of [
		["wrong-provider", { repoProvider: "github" }],
		["wrong-host", { repoHost: "foreign.example.test:8443" }],
		["wrong-port", { repoHost: "git.example.test:9443" }],
		["wrong-owner", { repoOwner: "team/sub" }],
		["wrong-name", { repoName: "repo" }],
		["wrong-iid", { prNumber: iid + 1 }],
	] as const) {
		h.seed(id, fields);
		h.link(`${id}-workspace`, id);
	}
	await syncGitLabPullRequestAfterWrite(h.ctx, {
		repo,
		prNumber: iid,
		expectedUrl,
		action: "close",
	});
	expect(h.row()?.state).toBe("closed");
	expect(h.refreshCalls).toEqual([["current-workspace"]]);
	const foreign = h.db
		.select()
		.from(schema.pullRequests)
		.all()
		.filter((row) => row.id !== "current");
	expect(foreign).toHaveLength(6);
	expect(
		foreign.every((row) => row.state === "open" && row.updatedAt === 1),
	).toBe(true);
});

test("native postwrite selected URL excludes a contradictory row despite matching slug and IID", async () => {
	const h = fixture();
	h.seed("current", {
		url: "https://foreign.example.test/Team/Sub/Repo/-/merge_requests/7",
	});
	h.link("current-workspace", "current");
	await syncGitLabPullRequestAfterWrite(h.ctx, {
		repo,
		prNumber: iid,
		expectedUrl,
		action: "close",
	});
	expect(h.row()?.state).toBe("open");
	expect(h.refreshCalls).toEqual([]);
});

test("native postwrite excludes archived and no-longer-current workspace links", async () => {
	const h = fixture();
	h.seed("current");
	h.seed("other", { prNumber: iid + 1 });
	h.link("archived", "current", 1);
	h.link("relinked", "other");
	h.link("unlinked", null);
	await syncGitLabPullRequestAfterWrite(h.ctx, {
		repo,
		prNumber: iid,
		action: "close",
	});
	expect(h.row()?.state).toBe("closed");
	expect(h.row("other")?.state).toBe("open");
	expect(h.refreshCalls).toEqual([]);
});

for (const merged of [true, false])
	test(`native postwrite confirmed merged=${merged} records confirmed merge timestamp`, async () => {
		const h = fixture();
		h.seed("current");
		h.link("current-workspace", "current");
		await syncGitLabPullRequestAfterWrite(h.ctx, {
			repo,
			prNumber: iid,
			action: "merge",
			merged,
		});
		expect(h.row()?.state).toBe(merged ? "merged" : "open");
		expect(h.row()?.mergedAt === null).toBe(!merged);
		expect(h.refreshCalls).toEqual([["current-workspace"]]);
	});

test("native postwrite preserves source merge time and draft on reopen", async () => {
	const h = fixture();
	h.seed("current", { isDraft: true, state: "closed", mergedAt: 123 });
	await syncGitLabPullRequestAfterWrite(h.ctx, {
		repo,
		prNumber: iid,
		action: "reopen",
	});
	expect(h.row()?.state).toBe("draft");
	expect(h.row()?.mergedAt).toBe(123);
});

test("native postwrite DB failure remains nonfatal after provider acceptance", async () => {
	const h = fixture();
	h.seed("current");
	h.link("current-workspace", "current");
	h.sqlite.exec(
		"CREATE TRIGGER fail_native_sync BEFORE UPDATE ON pull_requests BEGIN SELECT RAISE(ABORT,'OWNED_SYNC_FAILURE'); END",
	);
	await expect(
		syncGitLabPullRequestAfterWrite(h.ctx, {
			repo,
			prNumber: iid,
			action: "close",
		}),
	).resolves.toBeUndefined();
	expect(h.row()?.state).toBe("open");
	expect(h.refreshCalls).toEqual([]);
});

test("native postwrite refresh failure remains nonfatal and retains observed state", async () => {
	const h = fixture();
	h.seed("current");
	h.link("current-workspace", "current");
	h.ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces = async (ids) => {
		h.refreshCalls.push(ids);
		throw new Error("OWNED_REFRESH_FAILURE");
	};
	await expect(
		syncGitLabPullRequestAfterWrite(h.ctx, {
			repo,
			prNumber: iid,
			action: "close",
		}),
	).resolves.toBeUndefined();
	expect(h.row()?.state).toBe("closed");
	expect(h.refreshCalls).toEqual([["current-workspace"]]);
});

test("confirmed merge without workspace preserves its established timestamp", async () => {
	const h = fixture();
	h.seed("current", { mergedAt: 42 });
	await syncGitLabPullRequestAfterWrite(h.ctx, {
		repo,
		prNumber: iid,
		action: "merge",
		merged: true,
	});
	expect(h.row()?.mergedAt).toBe(42);
	expect(h.row()?.state).toBe("merged");
});

test("mark ready persists draft removal without a linked workspace", async () => {
	const h = fixture();
	h.seed("current", { state: "draft", isDraft: true });
	await syncGitLabPullRequestAfterWrite(h.ctx, {
		repo,
		prNumber: iid,
		action: "ready",
	});
	expect(h.row()?.state).toBe("open");
	expect(h.row()?.isDraft).toBe(false);
});
