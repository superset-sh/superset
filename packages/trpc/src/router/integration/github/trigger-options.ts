import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { findProviderIdentity } from "@superset/db/utils";
import { desc, eq } from "drizzle-orm";
import { installationOctokit } from "../../../lib/blaxel/clone-token";
import type { TriggerOptionSource } from "../trigger-options";

/** The synced repositories of the organization's installation, newest first. */
export async function listGithubRepositories(organizationId: string) {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId),
		columns: { id: true },
	});
	if (!installation) return [];
	return db.query.githubRepositories.findMany({
		where: eq(githubRepositories.installationId, installation.id),
		orderBy: [desc(githubRepositories.updatedAt)],
	});
}

/**
 * repoId is GitHub's numeric id, which is what the matcher compares against —
 * a full name would stop matching the moment someone renames the repo.
 */
const repositories: TriggerOptionSource = async ({ organizationId }) => {
	const list = await listGithubRepositories(organizationId);
	return list.map((repo) => {
		// Name as the label, owner as the muted hint beside it — every repo in
		// one installation shares the owner, so repeating it per row is noise.
		const slash = repo.fullName.indexOf("/");
		if (slash < 0) return { id: repo.repoId, label: repo.fullName };
		return {
			id: repo.repoId,
			label: repo.fullName.slice(slash + 1),
			hint: repo.fullName.slice(0, slash),
		};
	});
};

const PER_PAGE = 100;
const MAX_PEOPLE = 1000;

type GithubAccount = { id: number | bigint; login: string };
type Page = (page: number) => Promise<{ data: GithubAccount[] }>;

async function collect(seen: Map<string, string>, fetchPage: Page) {
	for (let page = 1; seen.size < MAX_PEOPLE; page++) {
		const { data } = await fetchPage(page);
		for (const account of data) seen.set(String(account.id), account.login);
		if (data.length < PER_PAGE) return;
	}
}

function isPermissionError(error: unknown): boolean {
	const status = (error as { status?: unknown }).status;
	return status === 403 || status === 404;
}

/**
 * The accounts a GitHub trigger can filter on, keyed by GitHub's numeric id —
 * the same value a delivery's `sender.id` carries, so a login rename cannot
 * break a saved filter. Organization installations list the organization's
 * members; user installations list the collaborators of the synced
 * repositories, deduplicated.
 */
const people: TriggerOptionSource = async ({ organizationId }) => {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId),
		columns: {
			id: true,
			installationId: true,
			accountLogin: true,
			accountType: true,
		},
	});
	if (!installation) return [];

	const octokit = await installationOctokit(installation.installationId);
	const seen = new Map<string, string>();
	try {
		if (installation.accountType === "Organization") {
			await collect(seen, (page) =>
				octokit.request("GET /orgs/{org}/members", {
					org: installation.accountLogin,
					per_page: PER_PAGE,
					page,
				}),
			);
		} else {
			const repositories = await db.query.githubRepositories.findMany({
				where: eq(githubRepositories.installationId, installation.id),
				columns: { owner: true, name: true },
			});
			for (const repository of repositories) {
				if (seen.size >= MAX_PEOPLE) break;
				await collect(seen, (page) =>
					octokit.request("GET /repos/{owner}/{repo}/collaborators", {
						owner: repository.owner,
						repo: repository.name,
						per_page: PER_PAGE,
						page,
					}),
				);
			}
		}
	} catch (error) {
		// The App was installed without the members permission (or the
		// repository is gone): an empty picker, not a red editor.
		if (isPermissionError(error)) {
			console.warn("[integration.github] people refused:", error);
			return [];
		}
		throw error;
	}

	return [...seen]
		.map(([id, login]) => ({ id, label: login }))
		.sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * The caller's own GitHub id — the editor uses its presence to warn when a
 * "Me" scope cannot resolve for them. Same lookup the dispatcher runs when a
 * "Me" trigger fires, so the warning and the runtime agree.
 */
const viewer: TriggerOptionSource = async ({ organizationId, userId }) => {
	const identity = await findProviderIdentity({
		organizationId,
		userId,
		provider: "github",
	});
	return identity
		? [{ id: identity.externalId, label: identity.handle ?? "Me" }]
		: [];
};

export const githubTriggerOptions = { repositories, people, viewer };
