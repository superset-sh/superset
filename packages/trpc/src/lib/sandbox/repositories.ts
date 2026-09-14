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
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "../../env";
import { installationOctokit } from "./clone-token";

export type RepositoryRow = typeof githubRepositories.$inferSelect;

export interface WorkspaceRepository {
	repository: RepositoryRow;
	branch: string;
	path: string;
	hooks: boolean;
}

/** Repositories by id, in the order given, all in one installation of `organizationId`. */
export async function loadRepositories(args: {
	organizationId: string;
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
	const byId = new Map(rows.map((row) => [row.id, row]));
	const ordered = args.repositoryIds.map((id) => byId.get(id));
	if (ordered.some((row) => !row)) {
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
	return ordered as RepositoryRow[];
}

export class RepositoryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RepositoryError";
	}
}

/** The environment's repositories, primary first. */
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
		.where(eq(environmentRepositories.environmentId, environmentId))
		.orderBy(asc(environmentRepositories.position));
	return rows.map((row) => row.repository);
}

/**
 * Fixes a new workspace's checkouts: the repositories it was created with,
 * each on its branch (the primary's chosen, the rest on their defaults) at
 * a path under the workspace root.
 */
export async function recordWorkspaceRepositories(args: {
	cloudWorkspaceId: string;
	repositories: readonly RepositoryRow[];
	primaryBranch: string;
}): Promise<void> {
	await db.insert(cloudWorkspaceRepositories).values(
		args.repositories.map((repository, position) => ({
			cloudWorkspaceId: args.cloudWorkspaceId,
			repositoryId: repository.id,
			branch: position === 0 ? args.primaryBranch : repository.defaultBranch,
			path: sandboxRepositoryPath(repository, args.repositories),
			position,
		})),
	);
}

/** What a workspace checked out, primary first, with the hooks repository marked. */
export async function workspaceRepositories(args: {
	cloudWorkspaceId: string;
	hooksRepositoryId: string | null;
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
		)
		.orderBy(asc(cloudWorkspaceRepositories.position));
	if (rows.length === 0)
		throw new RepositoryError("This workspace has no repositories");
	const hooksId = args.hooksRepositoryId ?? rows[0]?.repository.id;
	return rows.map(({ link, repository }) => ({
		repository,
		branch: link.branch,
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
