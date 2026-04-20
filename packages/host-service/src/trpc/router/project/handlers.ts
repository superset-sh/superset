import { rmSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { persistLocalProject } from "./utils/persist-project";
import { cloneRepoInto, resolveWithPrimaryRemote } from "./utils/resolve-repo";

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
