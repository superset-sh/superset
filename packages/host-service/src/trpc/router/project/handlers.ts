import { rmSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	resolveMatchingSlug,
	resolveWithPrimaryRemote,
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

// ============================================================================
// project.create
// ============================================================================

interface CreateResult {
	projectId: string;
	repoPath: string;
}

/**
 * Create flow — clone mode. Clone first so that clone-time failures (bad URL,
 * auth, network, dir collision) leave no cloud state behind; register the
 * cloud row afterwards and rollback the local clone if that fails. Mirrors
 * the local-first-then-cloud ordering used by workspace.create.
 */
export async function createFromClone(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string },
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(args.url, args.parentDir);
	try {
		const cloudProject = await ctx.api.v2Project.create.mutate({
			organizationId: ctx.organizationId,
			name: args.name,
			slug: slugifyProjectName(args.name),
			repoCloneUrl: args.url,
		});
		persistLocalProject(ctx, cloudProject.id, resolved);
		return { projectId: cloudProject.id, repoPath: resolved.repoPath };
	} catch (err) {
		try {
			rmSync(resolved.repoPath, { recursive: true, force: true });
		} catch (cleanupErr) {
			console.warn(
				"[project.createFromClone] failed to rollback clone after cloud error",
				{ repoPath: resolved.repoPath, cleanupErr },
			);
		}
		throw err;
	}
}

/**
 * Create flow — importLocal mode. User picked an existing on-disk git repo.
 * We derive the remote URL from the repo, register it with the cloud, then
 * register the local row.
 */
export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string },
): Promise<CreateResult> {
	const resolved = await resolveWithPrimaryRemote(args.repoPath);
	const cloudProject = await ctx.api.v2Project.create.mutate({
		organizationId: ctx.organizationId,
		name: args.name,
		slug: slugifyProjectName(args.name),
		repoCloneUrl: resolved.parsed.url,
	});
	persistLocalProject(ctx, cloudProject.id, resolved);
	return { projectId: cloudProject.id, repoPath: resolved.repoPath };
}

// ============================================================================
// project.setup
// ============================================================================

interface SetupContext {
	ctx: HostServiceContext;
	projectId: string;
	cloudRepoCloneUrl: string;
	expectedSlug: string;
}

interface SetupResult {
	repoPath: string;
}

/**
 * Setup flow — clone mode. Clone the cloud's authoritative URL into the
 * chosen parent directory.
 */
export async function setupFromClone(
	setup: SetupContext,
	args: { parentDir: string },
): Promise<SetupResult> {
	const resolved = await cloneRepoInto(setup.cloudRepoCloneUrl, args.parentDir);
	persistLocalProject(setup.ctx, setup.projectId, resolved);
	return { repoPath: resolved.repoPath };
}

/**
 * Setup flow — import mode. Point at an existing on-disk repo and verify
 * one of its remotes matches the cloud's authoritative slug.
 */
export async function setupFromImport(
	setup: SetupContext,
	args: { repoPath: string },
): Promise<SetupResult> {
	const resolved = await resolveMatchingSlug(args.repoPath, setup.expectedSlug);
	persistLocalProject(setup.ctx, setup.projectId, resolved);
	return { repoPath: resolved.repoPath };
}
