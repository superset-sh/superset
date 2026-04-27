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
	return lower.includes("v2_projects_org_slug_unique");
}

async function createCloudProjectWithSlugRetry(
	ctx: HostServiceContext,
	args: { name: string; repoCloneUrl?: string },
) {
	const baseSlug = slugifyProjectName(args.name);
	let lastError: unknown;
	const maxAttempts = 10;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const slug = slugWithSuffix(baseSlug, attempt);
		try {
			return await ctx.api.v2Project.create.mutate({
				organizationId: ctx.organizationId,
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

function persistLocalProjectOrWarn(
	ctx: HostServiceContext,
	projectId: string,
	resolved: ResolvedRepo,
	source: "createFromClone" | "createFromImportLocal",
): void {
	try {
		persistLocalProject(ctx, projectId, resolved);
	} catch (err) {
		console.warn(
			`[project.${source}] cloud project created but local persistence failed; rerun will need to relink`,
			{ projectId, repoPath: resolved.repoPath, err },
		);
		throw err;
	}
}

/**
 * Clone first so clone-time failures (bad URL, auth, network, dir
 * collision) leave no cloud state behind. The local clone can be removed
 * if later steps fail, but cloud projects are durable once created.
 */
export async function createFromClone(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string },
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(args.url, args.parentDir);
	let cloudProjectCreated = false;
	try {
		const cloudProject = await createCloudProjectWithSlugRetry(ctx, {
			name: args.name,
			repoCloneUrl: args.url,
		});
		cloudProjectCreated = true;
		persistLocalProjectOrWarn(
			ctx,
			cloudProject.id,
			resolved,
			"createFromClone",
		);
		return { projectId: cloudProject.id, repoPath: resolved.repoPath };
	} catch (err) {
		// Once a cloud project exists, keep the clone in place so rerun/recovery
		// has a local repo path to relink instead of creating a second clone.
		if (cloudProjectCreated) throw err;
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
	persistLocalProjectOrWarn(
		ctx,
		cloudProject.id,
		resolved,
		"createFromImportLocal",
	);
	return { projectId: cloudProject.id, repoPath: resolved.repoPath };
}
