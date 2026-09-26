/**
 * The repositories a cloud workspace checks out, and the one GitHub App
 * installation token that lets the box reach them.
 *
 * An environment lists its repositories in order; the shared image
 * environment lists none and takes them at workspace create. Whatever a
 * workspace ends up with is fixed at create in `cloud_workspace_repositories`
 * (repository, branch, path), because the box's checkout, the firewall's
 * rule and the desktop's rows all follow from it and must not drift.
 *
 * Every repository of a workspace must belong to one installation: the
 * firewall carries one header rule per host, so `github.com` gets one token,
 * and a token spans repositories only within its installation.
 */
import { db } from "@superset/db/client";
import {
	cloudWorkspaceRepositories,
	environmentRepositories,
	githubInstallations,
	githubRepositories,
} from "@superset/db/schema";
import {
	type SandboxRepository,
	sandboxRepositoryPath,
} from "@superset/shared/sandbox-contract";
import { and, eq, inArray } from "drizzle-orm";
import { env } from "../../env";
import { assertRepositoriesReachable } from "../github-user";
import { installationOctokit } from "./clone-token";

export type RepositoryRow = typeof githubRepositories.$inferSelect;

export interface WorkspaceRepository {
	repository: RepositoryRow;
	/** The branch the checkout works on, cut from `baseBranch`. */
	branch: string;
	/** The remote branch it is cut from, and what a pull request targets. */
	baseBranch: string;
	path: string;
	hooks: boolean;
}

/**
 * The branch a cloud workspace works on. Namespaced so it is obvious on the
 * remote who opened it, and suffixed with the workspace id because two
 * workspaces may carry the same name.
 */
export function workspaceBranchName(workspace: {
	id: string;
	name: string;
}): string {
	const slug = workspace.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return `superset/${slug || "workspace"}-${workspace.id.slice(0, 8)}`;
}

/**
 * Repositories by id, in the order given, all in one installation of
 * `organizationId` and all readable by `userId`.
 *
 * Belonging to the organization is not enough: the installation may be an
 * owner's personal account, whose private repositories no other member is
 * entitled to. Every caller that turns ids into repositories comes through
 * here, so the entitlement check cannot be forgotten by a new one.
 */
export async function loadRepositories(args: {
	organizationId: string;
	userId: string;
	repositoryIds: readonly string[];
}): Promise<RepositoryRow[]> {
	if (args.repositoryIds.length === 0) return [];
	const rows = await db
		.select()
		.from(githubRepositories)
		.where(
			and(
				inArray(githubRepositories.id, [...args.repositoryIds]),
				eq(githubRepositories.organizationId, args.organizationId),
			),
		);
	if (rows.length !== new Set(args.repositoryIds).size) {
		throw new RepositoryError(
			"A repository is not connected to this organization",
		);
	}
	const installations = new Set(rows.map((row) => row.installationId));
	if (installations.size > 1) {
		throw new RepositoryError(
			"Every repository of an environment must come from one GitHub installation",
		);
	}
	await assertRepositoriesReachable({
		userId: args.userId,
		organizationId: args.organizationId,
		repositories: rows,
	});
	return sortRepositories(rows);
}

/** Repositories read the same everywhere: by full name. */
export function sortRepositories<T extends { fullName: string }>(
	rows: readonly T[],
): T[] {
	return [...rows].sort((a, b) =>
		a.fullName.localeCompare(b.fullName, "en", { sensitivity: "base" }),
	);
}

/**
 * The repository a workspace opens on: the environment's config location,
 * else the first by name. Multi-repository workspaces opening at the root,
 * with a repository picker in the sidebar, is a TODO recorded in the plan.
 */
export function primaryRepository<T extends { id: string; fullName: string }>(
	rows: readonly T[],
	hooksRepositoryId: string | null | undefined,
): T | undefined {
	const sorted = sortRepositories(rows);
	return sorted.find((row) => row.id === hooksRepositoryId) ?? sorted[0];
}

export class RepositoryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RepositoryError";
	}
}

/** The environment's repositories, by name. */
export async function environmentRepositoryRows(
	environmentId: string,
): Promise<RepositoryRow[]> {
	const rows = await db
		.select({ repository: githubRepositories })
		.from(environmentRepositories)
		.innerJoin(
			githubRepositories,
			eq(environmentRepositories.repositoryId, githubRepositories.id),
		)
		.where(eq(environmentRepositories.environmentId, environmentId));
	return sortRepositories(rows.map((row) => row.repository));
}

/**
 * The repositories a workspace checked out, by name. Just the rows — for the
 * entitlement check on the paths that open an existing box, which needs to
 * know what is on its disk and nothing about branches.
 */
export async function workspaceRepositoryRows(
	cloudWorkspaceId: string,
): Promise<RepositoryRow[]> {
	const rows = await db
		.select({ repository: githubRepositories })
		.from(cloudWorkspaceRepositories)
		.innerJoin(
			githubRepositories,
			eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
		)
		.where(eq(cloudWorkspaceRepositories.cloudWorkspaceId, cloudWorkspaceId));
	return sortRepositories(rows.map((row) => row.repository));
}

/**
 * Fixes a new workspace's checkouts: the repositories it was created with,
 * each at a path under the workspace root.
 */
export async function recordWorkspaceRepositories(args: {
	cloudWorkspaceId: string;
	repositories: readonly RepositoryRow[];
}): Promise<void> {
	await db.insert(cloudWorkspaceRepositories).values(
		args.repositories.map((repository) => ({
			cloudWorkspaceId: args.cloudWorkspaceId,
			repositoryId: repository.id,
			path: sandboxRepositoryPath(repository, args.repositories),
		})),
	);
}

/** What a workspace checked out, the primary first, with the hooks repository marked. */
export async function workspaceRepositories(args: {
	cloudWorkspaceId: string;
	hooksRepositoryId: string | null;
	/** The base the primary is cut from; the others use their default branch. */
	primaryBranch: string;
	/** The branch every checkout works on. */
	workingBranch: string;
}): Promise<WorkspaceRepository[]> {
	const rows = await db
		.select({
			link: cloudWorkspaceRepositories,
			repository: githubRepositories,
		})
		.from(cloudWorkspaceRepositories)
		.innerJoin(
			githubRepositories,
			eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
		)
		.where(
			eq(cloudWorkspaceRepositories.cloudWorkspaceId, args.cloudWorkspaceId),
		);
	if (rows.length === 0)
		throw new RepositoryError("This workspace has no repositories");
	const primary = primaryRepository(
		rows.map((row) => row.repository),
		args.hooksRepositoryId,
	);
	const hooksId = primary?.id;
	const ordered = [...rows].sort((a, b) =>
		a.repository.id === hooksId
			? -1
			: b.repository.id === hooksId
				? 1
				: a.repository.fullName.localeCompare(b.repository.fullName, "en", {
						sensitivity: "base",
					}),
	);
	return ordered.map(({ link, repository }) => ({
		repository,
		branch: args.workingBranch,
		baseBranch:
			repository.id === hooksId ? args.primaryBranch : repository.defaultBranch,
		path: link.path,
		hooks: repository.id === hooksId,
	}));
}

export function cloneUrl(repository: RepositoryRow): string {
	return `https://github.com/${repository.owner}/${repository.name}.git`;
}

/** The identity's repository list: what the boot runner checks out. */
export function toSandboxRepositories(
	repositories: readonly WorkspaceRepository[],
): SandboxRepository[] {
	return repositories.map((entry) => ({
		url: cloneUrl(entry.repository),
		branch: entry.branch,
		...(entry.baseBranch === entry.branch
			? {}
			: { baseBranch: entry.baseBranch }),
		path: entry.path,
		...(entry.hooks ? { hooks: true } : {}),
	}));
}

/**
 * One installation token scoped to exactly these repositories, minted fresh
 * so the firewall rule re-applied on every wake never carries one about to
 * expire. Null when the App is not configured or the installation is gone,
 * which public repositories survive (they clone unauthenticated).
 */
export async function installationTokenFor(
	repositories: readonly RepositoryRow[],
): Promise<string | null> {
	const first = repositories[0];
	if (!first || !env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) return null;
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, first.installationId),
	});
	if (!installation) return null;
	try {
		const octokit = await installationOctokit(installation.installationId);
		const { token } = (await octokit.auth({
			type: "installation",
			refresh: true,
			repositoryNames: repositories.map((repository) => repository.name),
		})) as { token: string };
		return token;
	} catch (error) {
		if (repositories.some((repository) => repository.isPrivate)) throw error;
		console.warn(
			"[cloud-workspace] GitHub App token mint failed for public repositories; cloning without one",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}
