import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { SelectV2Project, SelectV2Workspace } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../db/schema";
import type { ProjectCreateProgressStage } from "../../../events";
import type { HostServiceContext } from "../../../types";
import { ensureMainWorkspaceStrict } from "./utils/ensure-main-workspace";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	cloneTemplateInto,
	initEmptyRepo,
	initLocalRepoInPlace,
	type ResolvedRepo,
	resolveLocalRepo,
	tryRevParseGitRoot,
} from "./utils/resolve-repo";

function slugifyProjectName(name: string): string {
	const slug = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project name must contain at least one alphanumeric character",
		});
	}
	return slug;
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

interface CreateResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string;
	project: SelectV2Project;
	mainWorkspace: SelectV2Workspace;
}

function emitProjectCreateProgress(
	ctx: HostServiceContext,
	requestId: string | undefined,
	stage: ProjectCreateProgressStage,
	message: string,
	percent: number | null = null,
): void {
	if (!requestId) return;
	ctx.eventBus.broadcastProjectCreateProgress({
		requestId,
		stage,
		message,
		percent,
		occurredAt: Date.now(),
	});
}

// Cloud v2Project.create catches v2_projects_org_slug_unique and re-throws
// as TRPCError CONFLICT with this exact message — kept stable so the slug
// retry below can detect it. If you change the cloud message, change this
// too.
const SLUG_CONFLICT_MESSAGE = "Project slug already exists";

function isSlugConflict(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return message === SLUG_CONFLICT_MESSAGE;
}

function stripTxid<T extends object>(row: T): Omit<T, "txid"> {
	const { txid: _txid, ...rest } = row as T & { txid?: unknown };
	return rest;
}

async function createCloudProjectWithSlugRetry(
	ctx: HostServiceContext,
	args: { id: string; name: string; repoCloneUrl?: string },
): Promise<SelectV2Project> {
	const baseSlug = slugifyProjectName(args.name);
	let lastError: unknown;
	const maxAttempts = 100;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
		try {
			const row = await ctx.api.v2Project.create.mutate({
				organizationId: ctx.organizationId,
				id: args.id,
				name: args.name,
				slug,
				repoCloneUrl: args.repoCloneUrl,
			});
			return stripTxid(row) as SelectV2Project;
		} catch (err) {
			if (!isSlugConflict(err)) throw err;
			lastError = err;
			console.warn("[project.create] slug conflict, retrying", {
				organizationId: ctx.organizationId,
				name: args.name,
				slug,
				attempt,
			});
		}
	}
	throw new TRPCError({
		code: "CONFLICT",
		message: `Could not allocate a unique slug for "${args.name}" after ${maxAttempts} attempts. Try a different project name.`,
		cause: lastError,
	});
}

/**
 * Create-project saga. The saga as a whole is the commit unit:
 *
 *   1. Local file ops (handled by the caller — clone / mkdir / etc.)
 *   2. Local DB project row (with client-supplied UUID)
 *   3. Cloud v2Project.create   (FK-required before workspace)
 *   4. Cloud v2Workspace.create + local workspace (ensureMainWorkspaceStrict)
 *
 * Any failure unwinds the prior steps in reverse, including a cloud
 * v2Project.delete to roll back step 3 if step 4 throws.
 */
async function persistFromResolved(
	ctx: HostServiceContext,
	args: {
		name: string;
		resolved: ResolvedRepo;
		cleanupRepoPathOnFailure: boolean;
		repoCloneUrlForCloud?: string;
	},
): Promise<CreateResult> {
	const projectId = randomUUID();
	let localProjectInserted = false;
	let cloudProjectCreated = false;

	try {
		persistLocalProject(ctx, projectId, args.resolved);
		localProjectInserted = true;

		const project = await createCloudProjectWithSlugRetry(ctx, {
			id: projectId,
			name: args.name,
			repoCloneUrl: args.repoCloneUrlForCloud,
		});
		cloudProjectCreated = true;

		const mainWorkspace = await ensureMainWorkspaceStrict(
			ctx,
			projectId,
			args.resolved.repoPath,
		);

		return {
			projectId,
			repoPath: args.resolved.repoPath,
			mainWorkspaceId: mainWorkspace.id,
			project,
			mainWorkspace,
		};
	} catch (err) {
		if (cloudProjectCreated) {
			try {
				await ctx.api.v2Project.delete.mutate({
					organizationId: ctx.organizationId,
					id: projectId,
				});
			} catch (cleanupErr) {
				console.warn(
					"[project.create] cloud rollback failed; orphan cloud row may remain",
					{ projectId, cleanupErr },
				);
			}
		}
		if (localProjectInserted) {
			try {
				ctx.db.delete(projects).where(eq(projects.id, projectId)).run();
			} catch (cleanupErr) {
				console.warn("[project.create] local rollback failed", {
					projectId,
					cleanupErr,
				});
			}
		}
		if (args.cleanupRepoPathOnFailure) {
			try {
				rmSync(args.resolved.repoPath, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.warn("[project.create] repo dir cleanup failed", {
					repoPath: args.resolved.repoPath,
					cleanupErr,
				});
			}
		}
		throw err;
	}
}

export async function createFromClone(
	ctx: HostServiceContext,
	args: {
		name: string;
		parentDir: string;
		url: string;
		progressRequestId?: string;
	},
): Promise<CreateResult> {
	try {
		emitProjectCreateProgress(
			ctx,
			args.progressRequestId,
			"cloning_repository",
			"Cloning repository",
			0,
		);
		const resolved = await cloneRepoInto(args.url, args.parentDir, {
			onProgress: (progress) => {
				emitProjectCreateProgress(
					ctx,
					args.progressRequestId,
					"cloning_repository",
					progress.message,
					progress.percent,
				);
			},
		});
		emitProjectCreateProgress(
			ctx,
			args.progressRequestId,
			"repository_ready",
			"Repository cloned",
			100,
		);
		emitProjectCreateProgress(
			ctx,
			args.progressRequestId,
			"registering_project",
			"Registering project",
		);
		const result = await persistFromResolved(ctx, {
			name: args.name,
			resolved,
			cleanupRepoPathOnFailure: true,
			// Only forward to cloud if the cloned repo actually has a parseable
			// GitHub remote — non-GitHub URLs and local paths become local-only
			// projects with no cloud repoCloneUrl.
			repoCloneUrlForCloud: resolved.parsed?.url,
		});
		emitProjectCreateProgress(
			ctx,
			args.progressRequestId,
			"ready",
			"Project ready",
			100,
		);
		return result;
	} catch (err) {
		emitProjectCreateProgress(
			ctx,
			args.progressRequestId,
			"failed",
			err instanceof Error ? err.message : String(err),
		);
		throw err;
	}
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
	if (!initIfNeeded) return resolveLocalRepo(repoPath);
	const root = await tryRevParseGitRoot(repoPath);
	return root ? resolveLocalRepo(root) : initLocalRepoInPlace(repoPath);
}

export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string; initIfNeeded?: boolean },
): Promise<CreateResult> {
	const resolved = await resolveOrInitLocalRepo(
		args.repoPath,
		args.initIfNeeded ?? false,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		// User pointed us at an existing folder; never rm it.
		cleanupRepoPathOnFailure: false,
		repoCloneUrlForCloud: resolved.parsed?.url,
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
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}
