/**
 * The cast for the GitHub authorization tests: an organization whose GitHub
 * App installation sits on the *owner's personal account*, so the owner's
 * private repositories are synced against the organization and every member
 * can see the rows. That is the shape the customer reported (SUPER-2432), and
 * the one every door has to refuse.
 */
import type { SelectGithubRepository } from "@superset/db/schema";

export const ORG_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
/** Connected the installation, so its contents are theirs by construction. */
export const OWNER_ID = "11111111-2222-4333-8444-555555555555";
/** A plain `member` of the same organization. Nothing is shared with them. */
export const MEMBER_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
/** A member who has connected GitHub and *is* a collaborator on the repo. */
export const COLLABORATOR_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

export const INSTALLATION_ID = "48151623";
export const INSTALLATION_ROW_ID = "dddddddd-eeee-4fff-8000-111111111111";

function repositoryRow(
	overrides: Partial<SelectGithubRepository> &
		Pick<SelectGithubRepository, "repoId" | "fullName" | "isPrivate">,
): SelectGithubRepository {
	const [owner = "", name = ""] = overrides.fullName.split("/");
	return {
		id: `repo-${overrides.repoId}`,
		installationId: INSTALLATION_ROW_ID,
		organizationId: ORG_ID,
		owner,
		name,
		defaultBranch: "main",
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	} as SelectGithubRepository;
}

/** The owner's personal private repository. The thing being protected. */
export const OWNER_PRIVATE = repositoryRow({
	repoId: "900001",
	fullName: "hugo/private-notes",
	isPrivate: true,
});

/** A private repository the collaborator genuinely has access to on GitHub. */
export const SHARED_PRIVATE = repositoryRow({
	repoId: "900002",
	fullName: "acme/billing",
	isPrivate: true,
});

/** Public: no boundary to enforce, so it must stay visible to everyone. */
export const ORG_PUBLIC = repositoryRow({
	repoId: "900003",
	fullName: "acme/website",
	isPrivate: false,
});

export const ALL_REPOSITORIES = [OWNER_PRIVATE, SHARED_PRIVATE, ORG_PUBLIC];

export const INSTALLATION = {
	id: INSTALLATION_ROW_ID,
	organizationId: ORG_ID,
	installationId: INSTALLATION_ID,
	connectedByUserId: OWNER_ID,
	accountLogin: "hugo",
	accountType: "User",
};

/** A `db` stand-in exposing only what the gated paths read. */
export function fakeDb(options: { installation?: unknown } = {}) {
	const installation =
		"installation" in options ? options.installation : INSTALLATION;
	return {
		query: {
			githubInstallations: { findFirst: async () => installation },
			githubRepositories: { findMany: async () => ALL_REPOSITORIES },
		},
	};
}

/**
 * Stands in for GitHub's "repositories this *user token* can see in this
 * installation" endpoint, which is what the gate asks. `null` is GitHub
 * refusing — the deployment has no OAuth client, the grant was revoked — and
 * must land the caller outside, not inside.
 */
export function fakeGithub(reachable: readonly string[] | null) {
	const calls: string[] = [];
	const fetchStub = async (input: string | URL | Request) => {
		const url = String(input);
		calls.push(url);
		if (reachable === null) {
			return new Response("forbidden", { status: 403 });
		}
		return Response.json({
			total_count: reachable.length,
			repositories: reachable.map((repoId) => ({ id: Number(repoId) })),
		});
	};
	return { fetchStub: fetchStub as unknown as typeof fetch, calls };
}

/**
 * `mock.module` replaces a module wholesale, so a partial stub breaks every
 * *other* importer of it — the barrel that re-exports it, a module reaching
 * for `dbWs`. These keep the surface complete so only the behaviour under test
 * changes.
 */
export function fakeDbModule(extra: Record<string, unknown> = {}) {
	const db = { ...fakeDb(), ...extra };
	return { db, dbWs: db };
}

export function fakeGithubUserModule(getToken: () => string | null) {
	const unused = () => {
		throw new Error("not stubbed for these tests");
	};
	return {
		githubUserTokenFor: async () => getToken(),
		completeGithubUserConnection: unused,
		disconnectGithubUser: unused,
		GithubUserConnectionError: Error,
		githubRepositoriesOutOfReach: unused,
		githubUserAuthorizeUrl: unused,
		githubUserConnectionConfigured: () => true,
		githubUserConnectionFor: unused,
	};
}
