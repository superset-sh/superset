import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { repositoryIdentityKey } from "@superset/shared/repo-identity";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../db/schema";
import { restoreProject } from "../../../projects/project-deletion";
import { detectRepoProvider } from "../../../runtime/repo-providers/detect-repo-provider";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import { gitResolveRepositoryTask } from "../../../workers/tasks/git";
import { persistLocalProject } from "./utils/persist-project";
import {
	adoptLocalRepo,
	cloneRepoInto,
	cloneTemplateInto,
	initEmptyRepo,
	initLocalRepoInPlace,
	type ResolvedRepo,
	tryRevParseGitRoot,
} from "./utils/resolve-repo";

export async function prepareProjectRepository(
	ctx: HostServiceContext,
	resolved: ResolvedRepo,
): Promise<ResolvedRepo> {
	const identity = resolved.identity;
	if (!identity) return resolved;
	const provider = await detectRepoProvider(identity, {
		getGitLabToken: (host) => ctx.credentials.getToken(host),
	});
	const inspected = await getHostWorkerPool().run(gitResolveRepositoryTask, {
		repoPath: resolved.repoPath,
	});
	const current = new Map(inspected.remotes).get(identity.remoteName);
	if (
		inspected.repoPath !== resolved.repoPath ||
		!current ||
		repositoryIdentityKey(current) !== repositoryIdentityKey(identity)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"The selected repository remote changed. Retry with its current authority and path.",
		});
	}
	return {
		...resolved,
		identity: { ...identity, provider: provider ?? "unknown" },
	};
}

function dirNameForEmpty(name: string): string {
	const slug = name
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project name must produce a non-empty directory name",
		});
	}
	return slug;
}

export interface CreateResult {
	projectId: string;
	repoPath: string;
	/** False when an existing local project row for the same repo path was
	 * reused instead of inserting a new one (importLocal only). Callers use
	 * this to skip side effects that would clobber user customizations. */
	created: boolean;
}

/**
 * Create-project saga — fully local, the cloud is never involved:
 *
 *   1. Local file ops (handled by the caller — clone / mkdir / etc.)
 *   2. Local DB project row (host-minted UUID)
 *
 * A project starts with zero workspaces; the user creates a local or
 * worktree workspace when they open it. A failure in step 2 unwinds the
 * file ops when the caller asked for that.
 */
async function persistFromResolved(
	ctx: HostServiceContext,
	args: {
		name: string;
		resolved: ResolvedRepo;
		cleanupRepoPathOnFailure: boolean;
		reuseExistingNativePath?: boolean;
	},
): Promise<CreateResult> {
	const projectId = randomUUID();
	try {
		const resolved = args.resolved.identity
			? await prepareProjectRepository(ctx, args.resolved)
			: args.resolved;
		if (resolved.identity && args.reuseExistingNativePath) {
			const current = ctx.db.query.projects
				.findFirst({ where: eq(projects.repoPath, resolved.repoPath) })
				.sync();
			if (current) {
				restoreProject(ctx, current.id);
				return {
					projectId: current.id,
					repoPath: resolved.repoPath,
					created: false,
				};
			}
		}
		persistLocalProject(ctx, projectId, resolved, { name: args.name });
	} catch (err) {
		if (args.cleanupRepoPathOnFailure) {
			try {
				await rm(args.resolved.repoPath, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.warn("[project.create] repo dir cleanup failed", {
					repoPath: args.resolved.repoPath,
					cleanupErr,
				});
			}
		}
		throw err;
	}
	return { projectId, repoPath: args.resolved.repoPath, created: true };
}

export async function createFromClone(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string; signal?: AbortSignal },
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(
		args.url,
		args.parentDir,
		ctx.credentials,
		args.signal,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}

/**
 * Resolve an existing repo, or — when `initIfNeeded` and the folder isn't a git
 * repo yet — `git init` it in place first. The init branch only runs after the
 * UI has confirmed intent with the user.
 */
async function resolveOrInitLocalRepo(
	repoPath: string,
	initIfNeeded: boolean,
): Promise<ResolvedRepo> {
	if (!initIfNeeded) return adoptLocalRepo(repoPath);
	const root = await tryRevParseGitRoot(repoPath);
	return root ? adoptLocalRepo(root) : initLocalRepoInPlace(repoPath);
}

export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string; initIfNeeded?: boolean },
): Promise<CreateResult> {
	const resolved = await resolveOrInitLocalRepo(
		args.repoPath,
		args.initIfNeeded ?? false,
	);

	// Idempotency guard: importing a repo that is already a project on this
	// device returns the existing project instead of minting a duplicate
	// row. Deliberately leaves the row untouched (no rename, no repo-field
	// refresh) — the user may have customized it in v2.
	const existing = ctx.db.query.projects
		.findFirst({ where: eq(projects.repoPath, resolved.repoPath) })
		.sync();
	if (existing) {
		restoreProject(ctx, existing.id);
		return {
			projectId: existing.id,
			repoPath: resolved.repoPath,
			created: false,
		};
	}

	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		// User pointed us at an existing folder; never rm it.
		cleanupRepoPathOnFailure: false,
		reuseExistingNativePath: true,
	});
}

/**
 * Empty mode: mkdir + git init + initial commit, then run the saga.
 * The project lives local-only — no GitHub remote until first push.
 */
export async function createFromEmpty(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string },
): Promise<CreateResult> {
	const resolved = await initEmptyRepo(
		args.parentDir,
		dirNameForEmpty(args.name),
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}

/**
 * Template mode: clone the template repo, strip history, re-init, then
 * run the saga. Like empty, the project lives local-only — no GitHub
 * remote until first push.
 */
export async function createFromTemplate(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string },
): Promise<CreateResult> {
	const resolved = await cloneTemplateInto(
		args.url,
		args.parentDir,
		dirNameForEmpty(args.name),
		ctx.credentials,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}
