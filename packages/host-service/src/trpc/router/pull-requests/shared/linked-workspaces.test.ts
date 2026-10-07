import { describe, expect, test } from "bun:test";
import { pullRequests } from "../../../../db/schema";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
	findPullRequestRowsByProject,
} from "./linked-workspaces";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	REPO,
	seedDuplicateCasingRow,
	seedLinkedPullRequest,
} from "./test-db";

describe("findPullRequestRows", () => {
	test("matches by repository and number, whatever the casing", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(
			findPullRequestRows(
				db,
				{ owner: "OctoCat", name: "HELLO" },
				PR_NUMBER,
			).map((row) => row.id),
		).toEqual(["pr-42"]);
	});

	test("finds a row a sibling project on the same repository refreshed last", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { rowProjectId: "other-project" });
		expect(
			findPullRequestRows(db, REPO, PR_NUMBER).map((row) => row.id),
		).toEqual(["pr-42"]);
	});

	test("returns every row when the repository was spelled two ways", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		seedDuplicateCasingRow(db);
		expect(
			findPullRequestRows(db, REPO, PR_NUMBER)
				.map((row) => row.id)
				.sort(),
		).toEqual(["pr-42", "pr-42-dup"]);
	});

	test("is empty for a PR the host has never seen", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findPullRequestRows(db, REPO, 99)).toEqual([]);
		expect(
			findPullRequestRows(db, { owner: "someone", name: "else" }, PR_NUMBER),
		).toEqual([]);
	});
});

describe("findPullRequestRowsByProject", () => {
	test("fallback cannot expose a GitLab row from another HTTPS authority", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		db.insert(pullRequests)
			.values({
				id: "foreign-native",
				projectId: PROJECT_ID,
				repoProvider: "gitlab",
				repoOwner: REPO.owner,
				repoName: REPO.name,
				prNumber: PR_NUMBER,
				url: `https://foreign.example.test:8443/${REPO.owner}/${REPO.name}/-/merge_requests/${PR_NUMBER}`,
				title: "Native row",
				state: "open",
				headBranch: "feature/42",
				headSha: "native-sha",
			})
			.run();
		expect(
			findPullRequestRowsByProject(db, PROJECT_ID, PR_NUMBER).map(
				(row) => row.id,
			),
		).toEqual(["pr-42"]);
	});
});

describe("findLinkedWorkspaceIds", () => {
	test("returns live linked workspaces, most recent activity first", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, ["pr-42"])).toEqual([
			"ws-newer",
			"ws-older",
		]);
	});

	test("spans every row it is given", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		seedDuplicateCasingRow(db);
		expect(findLinkedWorkspaceIds(db, ["pr-42", "pr-42-dup"])).toEqual([
			"ws-dup",
			"ws-newer",
			"ws-older",
		]);
	});

	test("is empty when nothing links to the rows", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, ["pr-43"])).toEqual([]);
		expect(findLinkedWorkspaceIds(db, [])).toEqual([]);
	});
});
