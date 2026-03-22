import { execGitWithShellPath } from "../git-client";
import { execWithShellEnv } from "../shell-env";
import {
	clearInFlightRepoContext,
	getCachedRepoContextState,
	getInFlightRepoContext,
	setCachedRepoContext,
	setInFlightRepoContext,
} from "./cache";
import { GHRepoResponseSchema, type RepoContext } from "./types";

async function refreshRepoContext(
	worktreePath: string,
): Promise<RepoContext | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "url,isFork,parent"],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const result = GHRepoResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] Repo schema validation failed:", result.error);
			console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
			return null;
		}

		const data = result.data;
		let context: RepoContext;

		if (data.isFork && data.parent) {
			context = {
				repoUrl: data.url,
				upstreamUrl: data.parent.url,
				isFork: true,
			};
		} else {
			const originUrl = await getOriginUrl(worktreePath);
			const ghUrl = normalizeGitHubUrl(data.url);

			if (data.isFork) {
				return null;
			}

			if (originUrl && ghUrl && originUrl !== ghUrl) {
				context = {
					repoUrl: originUrl,
					upstreamUrl: ghUrl,
					isFork: true,
				};
			} else {
				context = {
					repoUrl: data.url,
					upstreamUrl: data.url,
					isFork: false,
				};
			}
		}

		setCachedRepoContext(worktreePath, context);
		return context;
	} catch (error) {
		console.warn("[GitHub] Failed to refresh repo context:", error);
		return null;
	} finally {
		clearInFlightRepoContext(worktreePath);
	}
}

export async function getRepoContext(
	worktreePath: string,
): Promise<RepoContext | null> {
	const cached = getCachedRepoContextState(worktreePath);
	if (cached?.isFresh) {
		return cached.value;
	}

	const inFlight = getInFlightRepoContext(worktreePath);
	if (cached) {
		if (!inFlight) {
			const promise = refreshRepoContext(worktreePath);
			setInFlightRepoContext(worktreePath, promise);
		}

		return cached.value;
	}

	if (inFlight) {
		return inFlight;
	}

	const promise = refreshRepoContext(worktreePath);
	setInFlightRepoContext(worktreePath, promise);
	return promise;
}

async function getOriginUrl(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execGitWithShellPath(
			["remote", "get-url", "origin"],
			{ cwd: worktreePath },
		);
		return normalizeGitHubUrl(stdout.trim());
	} catch {
		return null;
	}
}

export function normalizeGitHubUrl(remoteUrl: string): string | null {
	const trimmed = remoteUrl.trim();
	const patterns = [
		/^git@github\.com:(?<nwo>[^/]+\/[^/]+?)(?:\.git)?$/,
		/^ssh:\/\/git@github\.com\/(?<nwo>[^/]+\/[^/]+?)(?:\.git)?$/,
		/^https:\/\/github\.com\/(?<nwo>[^/]+\/[^/]+?)(?:\.git)?\/?$/,
	];
	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		if (match?.groups?.nwo) {
			return `https://github.com/${match.groups.nwo}`;
		}
	}
	return null;
}

export function extractNwoFromUrl(normalizedUrl: string): string | null {
	try {
		const path = new URL(normalizedUrl).pathname.slice(1);
		return path || null;
	} catch {
		return null;
	}
}

export function getPullRequestRepoArgs(
	repoContext?: Pick<RepoContext, "isFork" | "upstreamUrl"> | null,
): string[] {
	if (!repoContext?.isFork) {
		return [];
	}

	const normalizedUpstreamUrl = normalizeGitHubUrl(repoContext.upstreamUrl);
	if (!normalizedUpstreamUrl) {
		return [];
	}

	const repoNameWithOwner = extractNwoFromUrl(normalizedUpstreamUrl);
	return repoNameWithOwner ? ["--repo", repoNameWithOwner] : [];
}
