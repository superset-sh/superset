import { rmSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	type ResolvedRepo,
	resolveLocalRepo,
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

interface CreateResult {
	projectId: string;
	repoPath: string;
}

function slugWithSuffix(baseSlug: string, attempt: number): string {
	return attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
}

function isSlugConflict(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	const lower = message.toLowerCase();
	return (
		lower.includes("v2_projects_org_slug_unique") ||
		lower.includes("duplicate key") ||
		lower.includes("unique constraint")
	);
}

async function createCloudProjectWithSlugRetry(
	ctx: HostServiceContext,
	args: { name: string; repoCloneUrl?: string },
) {
	const baseSlug = slugifyProjectName(args.name);
	let lastError: unknown;
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			return await ctx.api.v2Project.create.mutate({
				organizationId: ctx.organizationId,
				name: args.name,
				slug: slugWithSuffix(baseSlug, attempt),
				repoCloneUrl: args.repoCloneUrl,
			});
		} catch (err) {
			if (!isSlugConflict(err)) throw err;
			lastError = err;
		}
	}
	throw lastError;
}

async function persistProjectOrRollbackCloud(
	ctx: HostServiceContext,
	projectId: string,
	resolved: ResolvedRepo,
) {
	try {
		persistLocalProject(ctx, projectId, resolved);
	} catch (err) {
		await ctx.api.v2Project.deleteFromHost
			.mutate({ organizationId: ctx.organizationId, id: projectId })
			.catch((cleanupErr) => {
				console.warn(
					"[project.create] failed to rollback cloud project after local persistence error",
					{ projectId, cleanupErr },
				);
			});
		throw err;
	}
}

/**
 * Clone first so clone-time failures (bad URL, auth, network, dir
 * collision) leave no cloud state behind; rollback the local clone on
 * cloud failure. Mirrors workspace.create's local-first-then-cloud order.
 */
export async function createFromClone(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string },
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(args.url, args.parentDir);
	try {
		const cloudProject = await createCloudProjectWithSlugRetry(ctx, {
			name: args.name,
			repoCloneUrl: args.url,
		});
		await persistProjectOrRollbackCloud(ctx, cloudProject.id, resolved);
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

export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string },
): Promise<CreateResult> {
	const resolved = await resolveLocalRepo(args.repoPath);
	const cloudProject = await createCloudProjectWithSlugRetry(ctx, {
		name: args.name,
		repoCloneUrl: resolved.parsed?.url,
	});
	await persistProjectOrRollbackCloud(ctx, cloudProject.id, resolved);
	return { projectId: cloudProject.id, repoPath: resolved.repoPath };
}
