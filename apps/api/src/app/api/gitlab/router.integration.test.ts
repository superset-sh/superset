import { describe, expect, it } from "bun:test";
import { db } from "@superset/db/client";
import {
	integrationConnections,
	members,
	organizations,
	pullRequests,
	repositories,
	users,
} from "@superset/db/schema";
import { createCaller } from "@superset/trpc";
import { eq } from "drizzle-orm";

// Real router integration test: drives the actual @superset/trpc gitlab router through
// a real caller against the configured dev DB. Lives in apps/api (not packages/trpc)
// on purpose — the trpc package's sibling router tests `mock.module` the db client
// globally, which would shadow the real db here. Gated on a configured DB; skips in
// bare CI. This is the "real behavior, not mock call-order" bar.
// Runs when a real DB is configured: a Neon branch (local dev), the local neon-http
// proxy (db.localtest.me, used in CI), or an explicit RUN_DB_TESTS=1 flag.
const HAS_DB =
	process.env.RUN_DB_TESTS === "1" ||
	/neon\.tech|localtest\.me/.test(process.env.DATABASE_URL_UNPOOLED ?? "");

const ORG = "c0ffee00-0000-4000-8000-000000000001";
const USER = "c0ffee00-0000-4000-8000-000000000002";
const CONN = "c0ffee00-0000-4000-8000-000000000003";
const REPO1 = "c0ffee00-0000-4000-8000-000000000004";
const REPO2 = "c0ffee00-0000-4000-8000-000000000005";

function caller() {
	return createCaller({
		session: {
			user: { id: USER, email: "router-it@example.com" },
			session: { activeOrganizationId: ORG },
		},
		auth: {},
		headers: new Headers(),
	} as never);
}

async function cleanup() {
	await db
		.delete(integrationConnections)
		.where(eq(integrationConnections.id, CONN));
	await db.delete(repositories).where(eq(repositories.organizationId, ORG));
	await db.delete(members).where(eq(members.organizationId, ORG));
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(eq(users.id, USER));
}

async function seed() {
	await db
		.insert(users)
		.values({ id: USER, name: "RT", email: "router-it@example.com" });
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Router IT", slug: "router-it" });
	await db
		.insert(members)
		.values({ organizationId: ORG, userId: USER, role: "owner" });
	await db.insert(integrationConnections).values({
		id: CONN,
		organizationId: ORG,
		connectedByUserId: USER,
		provider: "gitlab",
		accessToken: "tok",
		externalOrgId: "42",
		externalOrgName: "acme",
		config: {
			provider: "gitlab",
			host: "gitlab.com",
			authMode: "token",
			groupPath: "acme",
		},
	});
	await db.insert(repositories).values([
		{
			provider: "gitlab",
			host: "gitlab.com",
			connectionId: CONN,
			organizationId: ORG,
			externalId: "100",
			owner: "acme",
			name: "api",
			fullName: "acme/api",
			defaultBranch: "main",
			isPrivate: true,
			id: REPO1,
		},
		{
			provider: "gitlab",
			host: "gitlab.com",
			connectionId: CONN,
			organizationId: ORG,
			externalId: "101",
			owner: "acme",
			name: "web",
			fullName: "acme/web",
			defaultBranch: "main",
			isPrivate: false,
			id: REPO2,
		},
	]);
	const reviewState = {
		provider: "gitlab" as const,
		detailedMergeStatus: "mergeable",
		approvalsRequired: 1,
		approvalsLeft: 0,
		approvedBy: ["alice"],
		blockingDiscussionsResolved: true,
		hasConflicts: false,
	};
	await db.insert(pullRequests).values([
		{
			provider: "gitlab",
			host: "gitlab.com",
			repositoryId: REPO1,
			organizationId: ORG,
			number: 1,
			externalId: "g1",
			headBranch: "f1",
			headSha: "s1",
			baseBranch: "main",
			title: "Open pending",
			url: "u1",
			authorLogin: "alice",
			state: "open",
			checksStatus: "pending",
			reviewStateJson: reviewState,
		},
		{
			provider: "gitlab",
			host: "gitlab.com",
			repositoryId: REPO1,
			organizationId: ORG,
			number: 2,
			externalId: "g2",
			headBranch: "f2",
			headSha: "s2",
			baseBranch: "main",
			title: "Open failing",
			url: "u2",
			authorLogin: "bob",
			state: "open",
			checksStatus: "failure",
			reviewStateJson: reviewState,
		},
		{
			provider: "gitlab",
			host: "gitlab.com",
			repositoryId: REPO2,
			organizationId: ORG,
			number: 3,
			externalId: "g3",
			headBranch: "f3",
			headSha: "s3",
			baseBranch: "main",
			title: "Merged",
			url: "u3",
			authorLogin: "alice",
			state: "merged",
			checksStatus: "success",
			reviewStateJson: reviewState,
		},
	]);
}

describe.skipIf(!HAS_DB)("gitlab router (integration)", () => {
	it("drives the real read procedures + disconnect cascade against Postgres", async () => {
		await cleanup();
		await seed();
		try {
			const c = caller();

			const conn = await c.integration.gitlab.getConnection({
				organizationId: ORG,
			});
			expect(conn?.groupId).toBe("42");
			expect(conn?.groupName).toBe("acme");
			expect(conn?.config?.host).toBe("gitlab.com");
			expect(conn?.needsReconnect).toBe(false);

			const repos = await c.integration.gitlab.listRepositories({
				organizationId: ORG,
			});
			expect(repos).toHaveLength(2);
			expect(repos.every((r) => r.provider === "gitlab")).toBe(true);

			const openPrs = await c.integration.gitlab.listPullRequests({
				organizationId: ORG,
			});
			expect(openPrs).toHaveLength(2); // default state=open
			expect(openPrs[0]?.repository.fullName).toMatch(/^acme\//);
			expect(
				openPrs.some(
					(p) =>
						(p.reviewStateJson as { provider?: string })?.provider === "gitlab",
				),
			).toBe(true);

			const allPrs = await c.integration.gitlab.listPullRequests({
				organizationId: ORG,
				state: "all",
			});
			expect(allPrs).toHaveLength(3);

			const stats = await c.integration.gitlab.getStats({
				organizationId: ORG,
			});
			expect(stats).toEqual({
				repositoryCount: 2,
				openPullRequestCount: 2,
				pendingChecksCount: 1,
				failedChecksCount: 1,
			});

			// disconnect cascades: connection → repositories (connectionId FK) → pull_requests
			const result = await c.integration.gitlab.disconnect({
				organizationId: ORG,
			});
			expect(result).toEqual({ success: true });
			const reposAfter = await db.query.repositories.findMany({
				where: eq(repositories.organizationId, ORG),
			});
			const prsAfter = await db.query.pullRequests.findMany({
				where: eq(pullRequests.organizationId, ORG),
			});
			expect(reposAfter).toHaveLength(0);
			expect(prsAfter).toHaveLength(0);
		} finally {
			await cleanup();
		}
	}, 30_000); // real Neon round-trips; well above bun's 5s default
});
