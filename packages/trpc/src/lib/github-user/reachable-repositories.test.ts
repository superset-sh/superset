import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	COLLABORATOR_ID,
	fakeDb,
	fakeDbModule,
	fakeGithub,
	fakeGithubUserModule,
	MEMBER_ID,
	ORG_ID,
	ORG_PUBLIC,
	OWNER_ID,
	OWNER_PRIVATE,
	SHARED_PRIVATE,
} from "../../../test/github-authz-fixtures";

mock.module("@superset/db/client", () => fakeDbModule());

let token: string | null = null;
mock.module("./github-user", () => fakeGithubUserModule(() => token));

const {
	assertRepositoriesReachable,
	clearReachableRepositoriesCache,
	reachableRepositories,
} = await import("./reachable-repositories");

const realFetch = globalThis.fetch;

function github(reachable: readonly string[] | null) {
	const { fetchStub, calls } = fakeGithub(reachable);
	globalThis.fetch = fetchStub;
	return calls;
}

function visibleTo(userId: string) {
	return reachableRepositories({
		userId,
		organizationId: ORG_ID,
		repositories: [OWNER_PRIVATE, SHARED_PRIVATE, ORG_PUBLIC],
	}).then((rows) => rows.map((row) => row.fullName));
}

beforeEach(() => {
	clearReachableRepositoriesCache();
	globalThis.fetch = realFetch;
	token = null;
});

describe("reachableRepositories", () => {
	test("a member with no GitHub connection gets the public repository only", async () => {
		token = null;
		expect(await visibleTo(MEMBER_ID)).toEqual(["acme/website"]);
	});

	test("a member GitHub does not show the repository to cannot see it", async () => {
		token = "ghu_member";
		github([ORG_PUBLIC.repoId]);
		expect(await visibleTo(MEMBER_ID)).toEqual(["acme/website"]);
	});

	test("a member GitHub does show it to keeps their access", async () => {
		token = "ghu_collaborator";
		github([SHARED_PRIVATE.repoId, ORG_PUBLIC.repoId]);
		expect(await visibleTo(COLLABORATOR_ID)).toEqual([
			"acme/billing",
			"acme/website",
		]);
	});

	test("whoever connected the installation keeps all of it, with no GitHub call", async () => {
		token = null;
		const calls = github([]);
		expect(await visibleTo(OWNER_ID)).toEqual([
			"hugo/private-notes",
			"acme/billing",
			"acme/website",
		]);
		expect(calls).toEqual([]);
	});

	test("GitHub refusing the lookup denies rather than admits", async () => {
		token = "ghu_member";
		github(null);
		expect(await visibleTo(MEMBER_ID)).toEqual(["acme/website"]);
	});

	test("reachability is asked once per person, not once per repository", async () => {
		token = "ghu_member";
		const calls = github([ORG_PUBLIC.repoId]);
		await visibleTo(MEMBER_ID);
		await visibleTo(MEMBER_ID);
		expect(calls.length).toBe(1);
		expect(calls[0]).toContain("/user/installations/48151623/repositories");
	});

	test("an organization with no installation has nothing private to give", async () => {
		mock.module("@superset/db/client", () =>
			fakeDbModule({ ...fakeDb({ installation: undefined }) }),
		);
		token = null;
		expect(await visibleTo(MEMBER_ID)).toEqual(["acme/website"]);
		mock.module("@superset/db/client", () => fakeDbModule());
	});
});

describe("assertRepositoriesReachable", () => {
	const assertFor = (userId: string, repositories = [OWNER_PRIVATE]) =>
		assertRepositoriesReachable({
			userId,
			organizationId: ORG_ID,
			repositories,
		});

	test("refuses a member for the owner's private repository, and names it", async () => {
		token = null;
		const error = await assertFor(MEMBER_ID).catch((e: unknown) => e);
		expect((error as { code?: string }).code).toBe("FORBIDDEN");
		expect((error as Error).message).toContain("hugo/private-notes");
	});

	test("lets the owner through", async () => {
		token = null;
		expect(await assertFor(OWNER_ID)).toBeUndefined();
	});

	test("lets a member through for a public repository", async () => {
		token = null;
		expect(await assertFor(MEMBER_ID, [ORG_PUBLIC])).toBeUndefined();
	});

	test("refuses the whole set when one repository is out of reach", async () => {
		token = "ghu_collaborator";
		github([SHARED_PRIVATE.repoId, ORG_PUBLIC.repoId]);
		const error = await assertFor(COLLABORATOR_ID, [
			SHARED_PRIVATE,
			OWNER_PRIVATE,
		]).catch((e: unknown) => e);
		expect((error as { code?: string }).code).toBe("FORBIDDEN");
		expect((error as Error).message).toContain("hugo/private-notes");
		expect((error as Error).message).not.toContain("acme/billing");
	});

	test("an empty set is nothing to refuse", async () => {
		expect(await assertFor(MEMBER_ID, [])).toBeUndefined();
	});
});
