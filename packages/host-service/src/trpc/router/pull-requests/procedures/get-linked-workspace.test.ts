import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects, pullRequests } from "../../../../db/schema";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	REPO,
	seedLinkedPullRequest,
	UNLINKED_PR_NUMBER,
} from "../shared/test-db";
import {
	createGetLinkedWorkspace,
	getLinkedWorkspace,
} from "./get-linked-workspace";

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function createRepoWithOrigin(): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "pr-linked-test-"));
	tempDirs.push(dir);
	const git = createUserSimpleGit(dir);
	await git.init();
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	await git.addRemote(
		"origin",
		`https://github.com/${REPO.owner}/${REPO.name}.git`,
	);
	return (await git.revparse(["--show-toplevel"])).trim();
}

const createCaller = createCallerFactory(router({ getLinkedWorkspace }));

function callerFor(db: ReturnType<typeof createTestDb>) {
	return createCaller({
		db,
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext);
}

describe("pullRequests.getLinkedWorkspace", () => {
	test("answers the most recently active linked workspace through the repository", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, await createRepoWithOrigin());

		expect(
			await callerFor(db).getLinkedWorkspace({
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER,
			}),
		).toEqual({ workspaceId: "ws-newer" });
	});

	test("still answers an existing link when the checkout is unavailable", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/nonexistent/checkout");

		expect(
			await callerFor(db).getLinkedWorkspace({
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER,
			}),
		).toEqual({ workspaceId: "ws-newer" });
	});

	test("answers none for a PR with a row but no live workspace", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/nonexistent/checkout");

		expect(
			await callerFor(db).getLinkedWorkspace({
				projectId: PROJECT_ID,
				prNumber: UNLINKED_PR_NUMBER,
			}),
		).toEqual({ workspaceId: null });
	});
});

test("missing native checkout retains only the project repository and expected URL link", async () => {
	const missing = async () => {
		throw new TRPCError({
			code: "BAD_REQUEST",
			cause: new Error("Fixture missing checkout"),
		});
	};
	const caller = createCallerFactory(
		router({ getLinkedWorkspace: createGetLinkedWorkspace(missing, missing) }),
	);
	const db = createTestDb();
	const nativeCaller = caller({
		db,
		isAuthenticated: true,
		organizationId: "fixture",
	} as unknown as HostServiceContext);
	seedLinkedPullRequest(db, "/nonexistent/native-checkout");
	const repoUrl = "https://gitlab.com/team/sub/repo";
	const expected = {
		provider: "gitlab" as const,
		projectId: PROJECT_ID,
		host: "gitlab.com",
		owner: "team/sub",
		repo: "repo",
		pullNumber: PR_NUMBER,
		expectedUrl: `${repoUrl}/-/merge_requests/${PR_NUMBER}`,
	};
	db.update(projects).set({ repoProvider: "gitlab", repoUrl }).run();
	db.update(pullRequests)
		.set({
			repoProvider: "gitlab",
			repoHost: expected.host,
			repoOwner: expected.owner,
			repoName: expected.repo,
			url: expected.expectedUrl,
		})
		.where(eq(pullRequests.id, "pr-42"))
		.run();
	expect(
		await nativeCaller.getLinkedWorkspace({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
		}),
	).toEqual({ workspaceId: "ws-newer" });
	expect(
		await nativeCaller.getLinkedWorkspace({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
			expectedPullRequest: expected,
		}),
	).toEqual({ workspaceId: "ws-newer", validatedPullRequest: expected });
	db.update(pullRequests)
		.set({ repoHost: "foreign.test" })
		.where(eq(pullRequests.id, "pr-42"))
		.run();
	expect(
		await nativeCaller.getLinkedWorkspace({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
		}),
	).toEqual({ workspaceId: null });
	await expect(
		nativeCaller.getLinkedWorkspace({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
			expectedPullRequest: {
				...expected,
				host: "foreign.test",
				expectedUrl: "https://foreign.test/team/sub/repo/-/merge_requests/42",
			},
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
