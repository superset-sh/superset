import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { projects, workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import {
	readProjectDeletionEligibility,
	requireProjectDeletionAccess,
} from "./project-deletion-access";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");
const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function seed({
	creator,
	workspaceCreators,
}: {
	creator: string | null;
	workspaceCreators: { userId: string | null; archived?: boolean }[];
}): HostDb {
	const db = drizzle(new Database(":memory:"), {
		schema,
	}) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(projects)
		.values({ id: PROJECT_ID, repoPath: "/repo", createdByUserId: creator })
		.run();
	workspaceCreators.forEach((workspace, index) => {
		db.insert(workspaces)
			.values({
				id: `ws-${index}`,
				projectId: PROJECT_ID,
				worktreePath: `/repo-${index}`,
				branch: `b-${index}`,
				createdByUserId: workspace.userId,
				archivedAt: workspace.archived ? Date.now() : null,
			})
			.run();
	});
	return db;
}

function contextFor(
	db: HostDb,
	userId: string | undefined,
	allowed: boolean | Error,
	calls: unknown[] = [],
) {
	return {
		db,
		userId,
		organizationId: "org",
		api: {
			host: {
				authorizeProjectDeletion: {
					query: async (input: unknown) => {
						calls.push(input);
						if (allowed instanceof Error) throw allowed;
						return { allowed };
					},
				},
			},
		},
	} as unknown as Pick<
		HostServiceContext,
		"db" | "api" | "organizationId" | "userId"
	>;
}

test("archived workspaces and the caller's own workspaces do not count as in use", () => {
	const db = seed({
		creator: "alice",
		workspaceCreators: [{ userId: "alice" }, { userId: "bob", archived: true }],
	});
	expect(readProjectDeletionEligibility(db, PROJECT_ID, "alice")).toEqual({
		createdByCaller: true,
		otherUsersWorkspaceCount: 0,
	});
});

test("workspaces with no recorded creator count as someone else's", () => {
	const db = seed({
		creator: "alice",
		workspaceCreators: [{ userId: "bob" }, { userId: null }],
	});
	expect(
		readProjectDeletionEligibility(db, PROJECT_ID, "alice")
			?.otherUsersWorkspaceCount,
	).toBe(2);
});

test("a project that predates creator tracking has no creator", () => {
	const db = seed({ creator: null, workspaceCreators: [] });
	expect(
		readProjectDeletionEligibility(db, PROJECT_ID, "alice")?.createdByCaller,
	).toBe(false);
});

test("the creator deletes an unused project without asking the API", async () => {
	const calls: unknown[] = [];
	const db = seed({
		creator: "alice",
		workspaceCreators: [{ userId: "alice" }],
	});
	await requireProjectDeletionAccess(
		contextFor(db, "alice", false, calls),
		PROJECT_ID,
	);
	expect(calls).toEqual([]);
});

test("the creator is refused when someone else has a workspace, unless an owner", async () => {
	const db = seed({ creator: "alice", workspaceCreators: [{ userId: "bob" }] });
	await expect(
		requireProjectDeletionAccess(contextFor(db, "alice", false), PROJECT_ID),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	await requireProjectDeletionAccess(contextFor(db, "alice", true), PROJECT_ID);
});

test("a non-creator needs the API to confirm ownership", async () => {
	const calls: unknown[] = [];
	const db = seed({ creator: "alice", workspaceCreators: [] });
	await expect(
		requireProjectDeletionAccess(
			contextFor(db, "bob", false, calls),
			PROJECT_ID,
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(calls).toMatchObject([{ organizationId: "org", userId: "bob" }]);
});

test("an anonymous caller is refused", async () => {
	const db = seed({ creator: null, workspaceCreators: [] });
	await expect(
		requireProjectDeletionAccess(contextFor(db, undefined, true), PROJECT_ID),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("an unreachable API refuses with a typed error instead of a 500", async () => {
	const db = seed({ creator: null, workspaceCreators: [] });
	await expect(
		requireProjectDeletionAccess(
			contextFor(db, "bob", new Error("fetch failed")),
			PROJECT_ID,
		),
	).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
});

test("a delete that under-counts other people's workspaces is refused before any owner check", async () => {
	const calls: unknown[] = [];
	const db = seed({
		creator: "alice",
		workspaceCreators: [{ userId: "bob" }, { userId: "carol" }],
	});
	await expect(
		requireProjectDeletionAccess(
			contextFor(db, "owner", true, calls),
			PROJECT_ID,
			0,
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	await expect(
		requireProjectDeletionAccess(
			contextFor(db, "owner", true, calls),
			PROJECT_ID,
			1,
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect(calls).toEqual([]);
	await requireProjectDeletionAccess(
		contextFor(db, "owner", true),
		PROJECT_ID,
		2,
	);
});

test("a caller that sends no acknowledged count keeps the previous behavior", async () => {
	const db = seed({ creator: "alice", workspaceCreators: [{ userId: "bob" }] });
	await requireProjectDeletionAccess(contextFor(db, "owner", true), PROJECT_ID);
});
