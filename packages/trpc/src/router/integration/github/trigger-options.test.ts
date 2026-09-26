/**
 * The listing door (SUPER-2432): `listGithubRepositories` is what every query
 * procedure on the GitHub router reads, so a member reaching the owner's
 * private repositories here reaches them everywhere.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	COLLABORATOR_ID,
	fakeDbModule,
	fakeGithub,
	fakeGithubUserModule,
	MEMBER_ID,
	ORG_ID,
	ORG_PUBLIC,
	OWNER_ID,
	SHARED_PRIVATE,
} from "../../../../test/github-authz-fixtures";

mock.module("@superset/db/client", () => fakeDbModule());

let token: string | null = null;
mock.module("../../../lib/github-user/github-user", () =>
	fakeGithubUserModule(() => token),
);

const { clearReachableRepositoriesCache } = await import(
	"../../../lib/github-user/reachable-repositories"
);
const { listGithubRepositories } = await import("./trigger-options");

const realFetch = globalThis.fetch;

beforeEach(() => {
	clearReachableRepositoriesCache();
	globalThis.fetch = realFetch;
	token = null;
});

const names = (userId: string) =>
	listGithubRepositories(ORG_ID, userId).then((rows) =>
		rows.map((row) => row.fullName).sort(),
	);

describe("listGithubRepositories", () => {
	test("an unshared member does not reach the owner's private repository", async () => {
		token = null;
		const visible = await names(MEMBER_ID);
		expect(visible).not.toContain("hugo/private-notes");
		expect(visible).toEqual(["acme/website"]);
	});

	test("the owner who connected the installation still sees all of it", async () => {
		token = null;
		expect(await names(OWNER_ID)).toEqual([
			"acme/billing",
			"acme/website",
			"hugo/private-notes",
		]);
	});

	// `getPullRequest` (added on main in #7823) resolves a repository by full
	// name and answers with the installation's token. It reads through this
	// function, so it inherits the gate — a member naming the owner's private
	// repository finds nothing to resolve against.
	test("a private repository is unresolvable by name for an unshared member", async () => {
		token = null;
		const byName = new Map(
			(await listGithubRepositories(ORG_ID, MEMBER_ID)).map((row) => [
				row.fullName.toLowerCase(),
				row,
			]),
		);
		expect(byName.get("hugo/private-notes")).toBeUndefined();
		expect(byName.get("acme/website")).toBeDefined();
	});

	test("a member GitHub grants access to keeps that repository", async () => {
		token = "ghu_collaborator";
		globalThis.fetch = fakeGithub([
			SHARED_PRIVATE.repoId,
			ORG_PUBLIC.repoId,
		]).fetchStub;
		expect(await names(COLLABORATOR_ID)).toEqual([
			"acme/billing",
			"acme/website",
		]);
	});
});
