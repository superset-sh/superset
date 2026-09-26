/**
 * The checkout door (SUPER-2432): `loadRepositories` turns repository ids into
 * the rows an environment is built from and a sandbox clones, with the App's
 * installation token. Belonging to the organization was the whole check, so a
 * member could point an environment at the owner's private repository and read
 * it off the box's disk.
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
	OWNER_PRIVATE,
	SHARED_PRIVATE,
} from "../../../test/github-authz-fixtures";

let rows: unknown[] = [];
mock.module("@superset/db/client", () =>
	fakeDbModule({
		select: () => ({ from: () => ({ where: async () => rows }) }),
	}),
);

let token: string | null = null;
mock.module("../github-user/github-user", () =>
	fakeGithubUserModule(() => token),
);

const { clearReachableRepositoriesCache } = await import(
	"../github-user/reachable-repositories"
);
const { loadRepositories } = await import("./repositories");

const realFetch = globalThis.fetch;

beforeEach(() => {
	clearReachableRepositoriesCache();
	globalThis.fetch = realFetch;
	token = null;
	rows = [];
});

const load = (userId: string, repositories: Array<{ id: string }>) => {
	rows = repositories;
	return loadRepositories({
		organizationId: ORG_ID,
		userId,
		repositoryIds: repositories.map((repository) => repository.id),
	});
};

describe("loadRepositories", () => {
	test("refuses a member the owner's private repository", async () => {
		token = null;
		const error = await load(MEMBER_ID, [OWNER_PRIVATE]).catch(
			(e: unknown) => e,
		);
		expect((error as { code?: string }).code).toBe("FORBIDDEN");
		expect((error as Error).message).toContain("hugo/private-notes");
	});

	test("refuses the set when only one repository is out of reach", async () => {
		token = null;
		const error = await load(MEMBER_ID, [ORG_PUBLIC, OWNER_PRIVATE]).catch(
			(e: unknown) => e,
		);
		expect((error as { code?: string }).code).toBe("FORBIDDEN");
	});

	test("a member keeps public repositories", async () => {
		token = null;
		const loaded = await load(MEMBER_ID, [ORG_PUBLIC]);
		expect(loaded.map((repository) => repository.fullName)).toEqual([
			"acme/website",
		]);
	});

	test("the owner keeps their own private repository", async () => {
		token = null;
		const loaded = await load(OWNER_ID, [OWNER_PRIVATE, ORG_PUBLIC]);
		expect(loaded.map((repository) => repository.fullName)).toEqual([
			"acme/website",
			"hugo/private-notes",
		]);
	});

	test("a member GitHub grants access to keeps that private repository", async () => {
		token = "ghu_collaborator";
		globalThis.fetch = fakeGithub([SHARED_PRIVATE.repoId]).fetchStub;
		const loaded = await load(COLLABORATOR_ID, [SHARED_PRIVATE]);
		expect(loaded.map((repository) => repository.fullName)).toEqual([
			"acme/billing",
		]);
	});
});
