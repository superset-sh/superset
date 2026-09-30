import {
	parseRepositoryRemote,
	type RepositoryIdentity,
	repositoryIdentityKey,
} from "@superset/shared/source-control";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import {
	emitProjectChanged,
	getLocalProject,
} from "../../../../projects/local-project-store";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import {
	configuredGitLabOrigins,
	configuredGitLabSshHosts,
} from "../../../../source-control/gitlab/exec-glab";
import { getToolEnvironment } from "../../../../terminal/clean-shell-env";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";
import {
	getAllRemoteUrls,
	getGitHubRemotes,
	getSourceControlRemotes,
} from "../../project/utils/git-remote";

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

export interface ResolvedGitLabRepo extends RepositoryIdentity {
	repoPathLocal: string;
}

const projectProbeCache = new Map<
	string,
	{ projectId: number; expiresAt: number }
>();

function remoteInstance(remoteUrl: string): string | null {
	const scp = remoteUrl.includes("://")
		? null
		: /^(?:[^@\s/:]+@)?(?<host>[^\s/:]+):[^\s]+$/.exec(remoteUrl.trim());
	if (scp?.groups?.host) return `https://${scp.groups.host}`;
	try {
		const url = new URL(remoteUrl);
		return url.protocol === "ssh:" ? `https://${url.host}` : url.origin;
	} catch {
		return null;
	}
}

export async function resolveGitLabRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedGitLabRepo> {
	const local = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!local?.repoPath) throw projectNotSetupError(projectId);
	let gitRoot: string;
	try {
		gitRoot = (
			await createUserSimpleGit(local.repoPath).revparse(["--show-toplevel"])
		).trim();
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to inspect git repository at ${local.repoPath}`,
			cause: error,
		});
	}
	const git = createUserSimpleGit(gitRoot);
	const toolEnvironment = await getToolEnvironment();
	const configuredHosts = [
		...(local.repoInstance ? [local.repoInstance] : []),
		...configuredGitLabOrigins(toolEnvironment),
	];
	const gitlabSshHosts = configuredGitLabSshHosts(toolEnvironment);
	const remotes = await getSourceControlRemotes(git, {
		gitlabHosts: configuredHosts,
		gitlabSshHosts,
	});
	const rawRemotes = await getAllRemoteUrls(git);
	const orderedNames = [
		...new Set([
			...(local.remoteName ? [local.remoteName] : []),
			"origin",
			...rawRemotes.keys(),
		]),
	];
	let selected: RepositoryIdentity | null = null;
	let probedProjectId: number | null = null;
	let probeError: unknown;
	for (const name of orderedNames) {
		const parsed = remotes.get(name);
		if (parsed?.provider === "gitlab") {
			selected = parsed;
			break;
		}
		const remoteUrl = rawRemotes.get(name);
		if (!remoteUrl || parsed?.provider === "github") continue;
		const candidateOrigin = remoteInstance(remoteUrl);
		if (!candidateOrigin) continue;
		const candidate = parseRepositoryRemote(remoteUrl, {
			gitlabHosts: [...configuredHosts, candidateOrigin],
			gitlabSshHosts,
		});
		if (!candidate || candidate.provider !== "gitlab") continue;
		try {
			const project = await ctx.gitlab.getProject(candidate);
			selected = candidate;
			probedProjectId = project.id;
			break;
		} catch (error) {
			probeError ??= error;
		}
	}
	if (!selected) {
		if (probeError) throw probeError;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${gitRoot} has no accessible GitLab remote.`,
		});
	}
	const cacheKey = repositoryIdentityKey(selected);
	const cached = projectProbeCache.get(cacheKey);
	let numericProjectId =
		probedProjectId ??
		(cached && cached.expiresAt > Date.now() ? cached.projectId : null);
	if (numericProjectId === null) {
		const project = await ctx.gitlab.getProject(selected);
		numericProjectId = project.id;
		projectProbeCache.set(cacheKey, {
			projectId: numericProjectId,
			expiresAt: Date.now() + 60_000,
		});
	}
	if (
		local.repoProvider !== "gitlab" ||
		local.repoInstance !== selected.instance ||
		local.repoOwner !== selected.owner ||
		local.repoName !== selected.name ||
		local.repoUrl !== selected.url ||
		local.repoProjectId !== numericProjectId
	) {
		ctx.db
			.update(projects)
			.set({
				repoProvider: "gitlab",
				repoInstance: selected.instance,
				repoOwner: selected.owner,
				repoName: selected.name,
				repoUrl: selected.url,
				repoProjectId: numericProjectId,
				updatedAt: Date.now(),
			})
			.where(eq(projects.id, projectId))
			.run();
		const updated = getLocalProject(ctx.db, projectId);
		if (updated) emitProjectChanged(ctx.eventBus, "updated", updated);
	}
	return { ...selected, projectId: numericProjectId, repoPathLocal: gitRoot };
}
