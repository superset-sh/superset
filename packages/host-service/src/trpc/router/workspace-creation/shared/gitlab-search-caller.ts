import { TRPCError } from "@trpc/server";
import { gitLabApiDeps } from "../../../../runtime/git/gitlab-api";
import { GitLabProviderClient } from "../../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import { GitLabRestError } from "../../../../runtime/repo-providers/gitlab/gitlab-rest";
import type { HostServiceContext } from "../../../../types";
import {
	type ResolvedRepo,
	resolveGithubRepo,
	resolveRepo,
} from "./project-helpers";

export interface SearchTarget {
	projectId: string;
	repo: ResolvedRepo;
}

export async function resolveSearchTargets(
	ctx: HostServiceContext,
	projectIds: string[],
	isBatch: boolean,
): Promise<SearchTarget[]> {
	async function resolveTarget(projectId: string): Promise<SearchTarget> {
		let selected: ResolvedRepo | undefined;
		try {
			selected = await resolveRepo(ctx, projectId);
		} catch (error) {
			if (
				!(error instanceof TRPCError) ||
				error.code !== "BAD_REQUEST" ||
				error.cause
			)
				throw error;
		}
		if (selected?.provider === "gitlab" || selected?.provider === "github")
			return { projectId, repo: selected };
		const github = await resolveGithubRepo(ctx, projectId);
		return {
			projectId,
			repo: {
				...github,
				provider: "github",
				host: "github.com",
				url: `https://github.com/${github.owner}/${github.name}`,
				remoteName: "",
			},
		};
	}
	if (!isBatch) {
		const projectId = projectIds[0];
		return projectId === undefined ? [] : [await resolveTarget(projectId)];
	}
	const settled = await Promise.allSettled(projectIds.map(resolveTarget));
	const targets = settled.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : [],
	);
	if (!targets.length) {
		const failed = settled.find((result) => result.status === "rejected");
		if (failed?.status === "rejected") throw failed.reason;
	}
	return targets;
}

export function selectSearchTargetsForQuery(
	raw: string,
	targets: SearchTarget[],
	kind: "pull" | "issue",
): { targets: SearchTarget[]; query: string; repoMismatch?: string } {
	if (!targets.some((target) => target.repo.provider === "gitlab"))
		return { targets, query: raw };
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		if (/^https?:\/\/.*\/-\/(merge_requests|issues)\//i.test(raw))
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid repository link authority.",
			});
		return { targets, query: raw };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:")
		return { targets, query: raw };
	const native = url.pathname.match(
		/^\/(.+\/.+)\/-\/(merge_requests|issues)\/(\d+)(?:\/.*)?$/,
	);
	const github = /^(?:www\.)?github\.com$/i.test(url.host)
		? url.pathname.match(
				/^\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)(?:\/.*)?$/i,
			)
		: null;
	const nativePath = native?.[1] ?? "";
	const nativeNumber = native?.[3] ?? "";
	const entityKind = native
		? native[2] === "merge_requests"
			? "pull"
			: "issue"
		: github
			? github[3]?.toLowerCase() === "pull"
				? "pull"
				: "issue"
			: null;
	if (!entityKind || entityKind !== kind) return { targets, query: raw };
	if (url.username || url.password || /^https?:\/\/[^/]*@/i.test(raw))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Repository links must not contain credentials.",
		});
	let projectPath: string;
	if (native) {
		const iid = Number(nativeNumber);
		if (!Number.isSafeInteger(iid) || iid <= 0)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid GitLab issue or merge request IID.",
			});
		try {
			projectPath = nativePath
				.split("/")
				.map((segment) => {
					const decoded = decodeURIComponent(segment);
					if (
						!decoded ||
						/[/\\]/.test(decoded) ||
						decoded === "." ||
						decoded === ".."
					)
						throw new Error("Invalid project path");
					return decoded;
				})
				.join("/");
		} catch {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid repository link path.",
			});
		}
	} else if (github) projectPath = `${github[1]}/${github[2]}`;
	else return { targets, query: raw };
	const matching = targets.filter(({ repo }) =>
		native
			? repo.provider === "gitlab" &&
				repo.host.toLowerCase() === url.host.toLowerCase() &&
				`${repo.owner}/${repo.name}` === projectPath
			: repo.provider === "github" &&
				`${repo.owner}/${repo.name}`.toLowerCase() ===
					projectPath.toLowerCase(),
	);
	if (!matching.length)
		return {
			targets: [],
			query: raw,
			repoMismatch: targets
				.map(({ repo }) => `${repo.host}/${repo.owner}/${repo.name}`)
				.join(", "),
		};
	return { targets: matching, query: native ? nativeNumber : raw };
}

export async function createGitLabSearchClient(
	ctx: HostServiceContext,
	repo: ResolvedRepo,
): Promise<GitLabProviderClient> {
	const deps = gitLabApiDeps(ctx.credentials, repo);
	const token = deps.request ? null : await deps.token();
	if (!deps.request && !token)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `No GitLab credentials are available for ${repo.host}.`,
		});
	return new GitLabProviderClient({ ...deps, token: async () => token });
}

export function gitLabSearchError(
	error: unknown,
	repo: ResolvedRepo,
): TRPCError {
	if (error instanceof TRPCError) return error;
	const status = error instanceof GitLabRestError ? error.status : null;
	const code =
		status === 401
			? "UNAUTHORIZED"
			: status === 403
				? "FORBIDDEN"
				: status === 429
					? "TOO_MANY_REQUESTS"
					: status === 404
						? "NOT_FOUND"
						: status !== null && status < 500
							? "BAD_REQUEST"
							: "SERVICE_UNAVAILABLE";
	return new TRPCError({
		code,
		message: `GitLab search failed for ${repo.host}${status === null ? "" : ` (${status})`}.`,
		cause: error,
	});
}
