import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { ensureMainWorkspaceStrict } from "./utils/ensure-main-workspace";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	cloneTemplateInto,
	initEmptyRepo,
	type ResolvedRepo,
	resolveLocalRepo,
} from "./utils/resolve-repo";
import { templateUrlFor } from "./utils/templates";

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
}

function slugWithSuffix(baseSlug: string, attempt: number): string {
	return attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
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

async function createCloudProjectWithSlugRetry(
	ctx: HostServiceContext,
	args: { id: string; name: string; repoCloneUrl?: string },
) {
	const baseSlug = slugifyProjectName(args.name);
	let lastError: unknown;
	const maxAttempts = 10;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const slug = slugWithSuffix(baseSlug, attempt);
		try {
			return await ctx.api.v2Project.create.mutate({
				organizationId: ctx.organizationId,
				id: args.id,
				name: args.name,
				slug,
				repoCloneUrl: args.repoCloneUrl,
			});
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
		message: `Could not allocate a unique slug for "${args.name}" after ${maxAttempts} attempts`,
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

		await createCloudProjectWithSlugRetry(ctx, {
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
	args: { name: string; parentDir: string; url: string },
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(args.url, args.parentDir);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
		// Only forward to cloud if the cloned repo actually has a parseable
		// GitHub remote — non-GitHub URLs and local paths become local-only
		// projects with no cloud repoCloneUrl.
		repoCloneUrlForCloud: resolved.parsed?.url,
	});
}

export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string },
): Promise<CreateResult> {
	const resolved = await resolveLocalRepo(args.repoPath);
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
	args: { name: string; parentDir: string; templateId: string },
): Promise<CreateResult> {
	const url = templateUrlFor(args.templateId);
	if (!url) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unknown template: ${args.templateId}`,
		});
	}
	const resolved = await cloneTemplateInto(
		url,
		args.parentDir,
		dirNameForEmpty(args.name),
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}
