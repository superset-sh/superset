/**
 * Which of an organization's synced repositories a caller may actually read.
 *
 * A GitHub App installation belongs to whoever connected it, and that is often
 * an owner's *personal* account (`accountType: "User"`). The sync records every
 * repository the installation can reach against the organization, so the
 * repositories table alone cannot answer who may see what: Superset membership
 * is not GitHub access. Every door onto installation contents narrows through
 * this gate first, and new doors get it by reusing `listGithubRepositories` or
 * `assertRepositoriesReachable` rather than querying the table directly.
 *
 * Public repositories are everyone's — there is no boundary to enforce. A
 * private one is the caller's only if GitHub says so for their own account, or
 * they are the person who connected the installation. Everything unproven is
 * denied: no GitHub connection, a deployment without the OAuth client, and an
 * API that refuses all land in the same place, which is out.
 */
import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { githubUserTokenFor } from "./github-user";

/**
 * The columns the gate reads. Narrow on purpose: callers hold rows from
 * several queries, and widening this would make them fetch columns they have
 * no other use for.
 */
export interface GatedRepository {
	/** GitHub's numeric id as a string — what the reachable set is keyed by. */
	repoId: string;
	fullName: string;
	isPrivate: boolean;
}

export interface RepositoryGate {
	allows(repository: GatedRepository): boolean;
}

const PER_PAGE = 100;
/** Enough for the largest installations without an unbounded API walk. */
const MAX_PAGES = 10;

/**
 * Reachability is a GitHub round trip, and the repository list is read on
 * every sidebar render. Cached briefly and per (person, installation): the
 * cost of the window is that access granted or revoked on GitHub takes up to
 * this long to be reflected here.
 */
const CACHE_TTL_MS = 60_000;

type CacheEntry = { expiresAt: number; repoIds: Set<string> | null };
const cache = new Map<string, CacheEntry>();

/** Test seam: reachability is cached per process, and cases must not bleed. */
export function clearReachableRepositoriesCache(): void {
	cache.clear();
}

/**
 * The installation repositories GitHub will show *this person's own account*,
 * by numeric id. Null when we cannot prove anything — no connection, no OAuth
 * client, or a refusal — which the gate reads as "no private repositories".
 */
async function reachableRepoIds(
	userId: string,
	installationId: string,
): Promise<Set<string> | null> {
	const key = `${userId}:${installationId}`;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.repoIds;

	const repoIds = await fetchReachableRepoIds(userId, installationId);
	cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, repoIds });
	return repoIds;
}

async function fetchReachableRepoIds(
	userId: string,
	installationId: string,
): Promise<Set<string> | null> {
	const token = await githubUserTokenFor(userId);
	if (!token) return null;

	// GitHub computes the intersection of the installation's repositories and
	// this account's access itself, so this is one paginated call rather than
	// a permission probe per repository.
	const ids = new Set<string>();
	try {
		for (let page = 1; page <= MAX_PAGES; page++) {
			const response = await fetch(
				`https://api.github.com/user/installations/${encodeURIComponent(installationId)}/repositories?per_page=${PER_PAGE}&page=${page}`,
				{
					headers: {
						accept: "application/vnd.github+json",
						authorization: `Bearer ${token}`,
						"x-github-api-version": "2022-11-28",
					},
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (!response.ok) {
				console.warn(
					`[github-user] reachability refused for ${userId} on installation ${installationId}: HTTP ${response.status}`,
				);
				return null;
			}
			const body = (await response.json()) as {
				repositories?: Array<{ id: number }>;
			};
			const page_ = body.repositories ?? [];
			for (const repository of page_) ids.add(String(repository.id));
			if (page_.length < PER_PAGE) break;
		}
	} catch (error) {
		console.warn(
			`[github-user] reachability lookup failed for ${userId}`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
	return ids;
}

/**
 * The gate for one person in one organization. Built once per request and
 * reused across the repositories being checked, so a listing costs at most one
 * GitHub call rather than one per row.
 */
export async function repositoryGateFor(args: {
	userId: string;
	organizationId: string;
}): Promise<RepositoryGate> {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, args.organizationId),
		columns: { installationId: true, connectedByUserId: true },
	});

	// No installation means no synced repositories to gate. Public-only keeps
	// the gate total, so a caller cannot smuggle a row from elsewhere past it.
	if (!installation) return { allows: (repository) => !repository.isPrivate };

	// The person who connected the installation authorized it against their own
	// GitHub account, so its contents are theirs by construction. Without this
	// they would need a *separate* user connection to keep seeing their own
	// repositories, and connecting the App does not create one.
	if (installation.connectedByUserId === args.userId) {
		return { allows: () => true };
	}

	const repoIds = await reachableRepoIds(
		args.userId,
		installation.installationId,
	);
	return {
		allows: (repository) =>
			!repository.isPrivate || (repoIds?.has(repository.repoId) ?? false),
	};
}

/** The subset of `repositories` the caller may read, in the order given. */
export async function reachableRepositories<T extends GatedRepository>(args: {
	userId: string;
	organizationId: string;
	repositories: readonly T[];
}): Promise<T[]> {
	if (args.repositories.length === 0) return [];
	const gate = await repositoryGateFor(args);
	return args.repositories.filter((repository) => gate.allows(repository));
}

/**
 * Refuses unless the caller may read every one of `repositories`. For the
 * paths that act on a named set — creating a workspace over it, opening the
 * box that checked it out — where silently dropping a row would produce a
 * half-configured environment instead of an error.
 */
export async function assertRepositoriesReachable(args: {
	userId: string;
	organizationId: string;
	repositories: readonly GatedRepository[];
}): Promise<void> {
	if (args.repositories.length === 0) return;
	const gate = await repositoryGateFor(args);
	const outOfReach = args.repositories
		.filter((repository) => !gate.allows(repository))
		.map((repository) => repository.fullName);
	if (outOfReach.length === 0) return;
	throw userError({
		code: "FORBIDDEN",
		message: `Your GitHub account cannot reach ${outOfReach.join(", ")}. Connect GitHub in Settings, or ask for access on GitHub.`,
		i18nKey: "serverError.github.repositoriesOutOfReach",
		params: { repositories: outOfReach.join(", ") },
	});
}
