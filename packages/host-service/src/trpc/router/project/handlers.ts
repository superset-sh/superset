import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../db/schema";
import { emitProjectChanged } from "../../../projects/local-project-store";
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
	mainWorkspaceId: string;
}

/**
 * Create-project saga — fully local, the cloud is never involved:
 *
 *   1. Local file ops (handled by the caller — clone / mkdir / etc.)
 *   2. Local DB project row (host-minted UUID)
 *   3. Local main workspace (ensureMainWorkspaceStrict)
 *
 * A failure in 2–3 unwinds locally.
 */
async function persistFromResolved(
	ctx: HostServiceContext,
	args: {
		name: string;
		resolved: ResolvedRepo;
		cleanupRepoPathOnFailure: boolean;
	},
): Promise<CreateResult> {
	const projectId = randomUUID();
	let localProjectInserted = false;

	try {
		persistLocalProject(ctx, projectId, args.resolved, { name: args.name });
		localProjectInserted = true;

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
		if (localProjectInserted) {
			try {
				ctx.db.delete(projects).where(eq(projects.id, projectId)).run();
				emitProjectChanged(ctx.eventBus, "deleted", projectId);
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
	const resolved = await cloneRepoInto(
		args.url,
		args.parentDir,
		ctx.credentials,
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
