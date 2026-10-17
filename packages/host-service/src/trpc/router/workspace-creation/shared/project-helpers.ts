import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { SimpleGit } from "simple-git";
import { projects } from "../../../../db/schema";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";
import {
	getGitHubRemotes,
	type ParsedGitHubRemote,
} from "../../project/utils/git-remote";
import { getForkParent, getGhDefaultRepo } from "./github-base-repo";

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

async function resolveProjectRemotes(
	ctx: HostServiceContext,
	projectId: string,
): Promise<{
	repo: ResolvedGithubRepo;
	git: SimpleGit;
	remotes: Map<string, ParsedGitHubRemote>;
}> {
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

	const git = createUserSimpleGit(gitRoot);
	const remotes = await getGitHubRemotes(git);
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
		repo: { owner: preferred.owner, name: preferred.name, repoPath: gitRoot },
		git,
		remotes,
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
	return (await resolveProjectRemotes(ctx, projectId)).repo;
}

/**
 * The repo a project's issues and pull requests live in, which differs from
 * {@link resolveGithubRepo} when `origin` is the user's fork. Same order as
 * `gh`: the repo `gh repo set-default` chose, else the parent of a fork, else
 * the repo the remote points at. Branches are pushed to the fork, so anything
 * that writes a branch or opens a PR from one keeps using `resolveGithubRepo`.
 */
export async function resolveGithubBaseRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedGithubRepo> {
	const { repo, git, remotes } = await resolveProjectRemotes(ctx, projectId);

	const ghDefault = await getGhDefaultRepo(git, remotes);
	if (ghDefault) return { ...ghDefault, repoPath: repo.repoPath };

	try {
		const parent = await getForkParent(repo, ctx);
		if (parent) return { ...parent, repoPath: repo.repoPath };
	} catch (err) {
		console.warn(
			`[resolveGithubBaseRepo] couldn't check whether ${repo.owner}/${repo.name} is a fork`,
			err,
		);
	}
	return repo;
}
