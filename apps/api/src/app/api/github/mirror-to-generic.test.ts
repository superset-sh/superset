import { describe, expect, it } from "bun:test";
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
	organizations,
	pullRequests,
	repositories,
	users,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import {
	deleteGenericGithubRepo,
	mirrorGithubToGeneric,
} from "./mirror-to-generic";

// Real-DB integration test for the github→generic mirror (the Drizzle reconcile that
// backs the backfill + dual-write). Runs against the configured dev DB; skips cleanly
// in environments without one (bare CI). Importing @superset/db loads root .env, so
// DATABASE_URL_UNPOOLED is populated when a dev DB is wired up.
// Runs when a real DB is configured: a Neon branch (local dev), the local neon-http
// proxy (db.localtest.me, used in CI), or an explicit RUN_DB_TESTS=1 flag.
const HAS_DB =
	process.env.RUN_DB_TESTS === "1" ||
	/neon\.tech|localtest\.me/.test(process.env.DATABASE_URL_UNPOOLED ?? "");

const ORG = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const USER = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const INST = "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1";
const REPO = "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2";

async function cleanup() {
	await db.delete(repositories).where(eq(repositories.organizationId, ORG));
	await db.delete(githubInstallations).where(eq(githubInstallations.id, INST));
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(eq(users.id, USER));
}

describe.skipIf(!HAS_DB)("mirrorGithubToGeneric (integration)", () => {
	it("backfills github_* into the generic tables with the §6 github reviewState", async () => {
		await cleanup();
		await db
			.insert(users)
			.values({ id: USER, name: "T", email: "mirror-it@example.com" });
		await db
			.insert(organizations)
			.values({ id: ORG, name: "Mirror IT", slug: "mirror-it" });
		await db.insert(githubInstallations).values({
			id: INST,
			organizationId: ORG,
			connectedByUserId: USER,
			installationId: "inst-it",
			accountLogin: "acme",
			accountType: "Organization",
		});
		await db.insert(githubRepositories).values({
			id: REPO,
			installationId: INST,
			organizationId: ORG,
			repoId: "880011",
			owner: "acme",
			name: "svc",
			fullName: "acme/svc",
			defaultBranch: "main",
			isPrivate: true,
		});
		await db.insert(githubPullRequests).values({
			repositoryId: REPO,
			organizationId: ORG,
			prNumber: 3,
			nodeId: "PR_node_3",
			headBranch: "feat",
			headSha: "sha3",
			baseBranch: "main",
			title: "IT mirror",
			url: "https://gh/pr/3",
			authorLogin: "octocat",
			state: "open",
			reviewDecision: "APPROVED",
			checksStatus: "success",
			checks: [{ name: "ci", status: "completed", conclusion: "success" }],
		});

		try {
			await mirrorGithubToGeneric();

			const repo = await db.query.repositories.findFirst({
				where: and(
					eq(repositories.organizationId, ORG),
					eq(repositories.provider, "github"),
				),
			});
			expect(repo?.externalId).toBe("880011");
			expect(repo?.fullName).toBe("acme/svc");
			expect(repo?.installationId).toBe(INST);
			expect(repo?.connectionId).toBeNull();

			const pr = await db.query.pullRequests.findFirst({
				where: and(
					eq(pullRequests.organizationId, ORG),
					eq(pullRequests.provider, "github"),
				),
			});
			expect(pr?.number).toBe(3);
			expect(pr?.externalId).toBe("PR_node_3");
			expect(pr?.reviewStateJson).toEqual({
				provider: "github",
				reviewDecision: "APPROVED",
			});
			expect(pr?.checks?.[0]?.name).toBe("ci");

			// Idempotent: a second run produces no duplicates.
			await mirrorGithubToGeneric();
			const repoCount = await db.query.repositories.findMany({
				where: eq(repositories.organizationId, ORG),
			});
			expect(repoCount).toHaveLength(1);

			// deleteGenericGithubRepo cascades to the generic PRs.
			await deleteGenericGithubRepo("880011");
			const prsLeft = await db.query.pullRequests.findMany({
				where: eq(pullRequests.organizationId, ORG),
			});
			expect(prsLeft).toHaveLength(0);
		} finally {
			await cleanup();
		}
	});
});
