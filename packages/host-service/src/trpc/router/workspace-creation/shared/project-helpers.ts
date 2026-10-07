import { type ParsedRemote, parseGitRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import { detectRepoProvider } from "../../../../runtime/repo-providers/detect-repo-provider";
import type { HostServiceContext } from "../../../../types";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import {
	gitConfirmNoPlatformRemotesTask,
	gitResolveRepositoryTask,
} from "../../../../workers/tasks/git";
import type { ProjectNotSetupCause } from "../../../error-types";
import { getGitHubRemotes } from "../../project/utils/git-remote";

export function projectNotSetupError(projectId: string): TRPCError {
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message: "Project is not set up on this host",
		cause: {
			kind: "PROJECT_NOT_SETUP",
			projectId,
		} satisfies ProjectNotSetupCause,
	});
}

export interface ResolvedGithubRepo {
	owner: string;
	name: string;
	/** Canonical local clone path. */
	repoPath: string;
}

export interface ResolvedRepo extends ParsedRemote {
	repoPath: string;
	remoteName: string;
}

export interface ResolveRepoOptions {
	validateRemote?: (remote: ParsedRemote) => void;
	allowNoPlatformRemote?: false;
}

type DecliningResolveRepoOptions = Omit<
	ResolveRepoOptions,
	"allowNoPlatformRemote"
> & {
	allowNoPlatformRemote: true;
};

export function resolveRepo(
	ctx: Pick<HostServiceContext, "db" | "credentials">,
	projectId: string,
	options: DecliningResolveRepoOptions,
): Promise<ResolvedRepo | null>;
export function resolveRepo(
	ctx: Pick<HostServiceContext, "db" | "credentials">,
	projectId: string,
	options?: ResolveRepoOptions,
): Promise<ResolvedRepo>;
export async function resolveRepo(
	ctx: Pick<HostServiceContext, "db" | "credentials">,
	projectId: string,
	options: ResolveRepoOptions | DecliningResolveRepoOptions = {},
): Promise<ResolvedRepo | null> {
	const local = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!local?.repoPath) throw projectNotSetupError(projectId);

	let result: Awaited<ReturnType<typeof gitResolveRepositoryTask.handler>>;
	try {
		result = await getHostWorkerPool().run(
			gitResolveRepositoryTask,
			{
				repoPath: local.repoPath,
				repoUrl: local.repoProvider === "gitlab" ? local.repoUrl : undefined,
			},
			{ timeoutMs: 15_000 },
		);
	} catch (cause) {
		throw new TRPCError({ code: "BAD_REQUEST", cause });
	}
	const { repoPath } = result;
	const remotes = new Map<string, ParsedRemote>();
	const expected = local.repoUrl ? parseGitRemote(local.repoUrl) : null;
	for (const [name, remote] of result.remotes) {
		if (
			!remotes.has(name) ||
			(expected &&
				remote.host === expected.host &&
				remote.owner === expected.owner &&
				remote.name === expected.name)
		)
			remotes.set(name, remote);
	}
	const remoteName =
		(local.remoteName && remotes.has(local.remoteName)
			? local.remoteName
			: undefined) ??
		(remotes.has("origin") ? "origin" : undefined) ??
		remotes.keys().next().value;
	const remote = remoteName ? remotes.get(remoteName) : undefined;
	if (!remote || !remoteName) {
		if (options.allowNoPlatformRemote) {
			try {
				const confirmed = await getHostWorkerPool().run(
					gitConfirmNoPlatformRemotesTask,
					{ repoPath },
					{ timeoutMs: 15_000 },
				);
				if (
					confirmed.repoPath === repoPath &&
					confirmed.noPlatformRemote === true
				)
					return null;
			} catch (cause) {
				throw new TRPCError({ code: "BAD_REQUEST", cause });
			}
		}
		throw new TRPCError({ code: "BAD_REQUEST" });
	}
	options.validateRemote?.(remote);
	const provider = await detectRepoProvider(remote, {
		hint: { provider: local.repoProvider, url: local.repoUrl },
		getGitLabToken: (host) => ctx.credentials.getToken(host),
	});
	return {
		...remote,
		provider: provider ?? remote.provider,
		repoPath,
		remoteName,
	};
}

/**
 * Resolve `{owner, name, repoPath}` for a project from the **live** local
 * git remote. Cloud `repoCloneUrl` and cached `projects.repoOwner`/`repoName`
 * are setup-time snapshots that drift on rename/fork/remote re-point;
 * GitHub queries must target wherever the remote points right now.
 *
 * `rev-parse --show-toplevel` validates the path is a git repo.
 * `getGitHubRemotes` reads via `git config --get-regexp ^remote\..*\.url$`
 * to avoid `git remote -v`'s `[blob:none]` partial-clone markers.
 *
 * Remote preference: configured `remoteName` → `origin` → first GitHub remote.
 */
export async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedGithubRepo> {
	const local = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!local?.repoPath) {
		throw projectNotSetupError(projectId);
	}

	let gitRoot: string;
	try {
		gitRoot = (
			await createUserSimpleGit(local.repoPath).revparse(["--show-toplevel"])
		).trim();
	} catch (err) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to inspect git repository at ${local.repoPath}`,
			cause: err,
		});
	}

	const remotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));
	const preferred =
		(local.remoteName ? remotes.get(local.remoteName) : undefined) ??
		remotes.get("origin") ??
		remotes.values().next().value;

	if (!preferred) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${gitRoot} has no GitHub remote.`,
		});
	}

	return {
		owner: preferred.owner,
		name: preferred.name,
		repoPath: gitRoot,
	};
}
