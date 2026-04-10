import { existsSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	extractGitHubSlug,
	findMatchingRemote,
	getAllRemoteUrls,
} from "./utils/git-remote";

export const projectRouter = router({
	setup: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				mode: z.enum(["import", "clone"]),
				localPath: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.api) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud API not configured",
				});
			}

			const cloudProject = await ctx.api.v2Project.get.query({
				organizationId: ctx.organizationId,
				id: input.projectId,
			});

			if (!cloudProject.repoCloneUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Project has no linked GitHub repository — cannot set up",
				});
			}

			const expectedSlug = extractGitHubSlug(cloudProject.repoCloneUrl);
			if (!expectedSlug) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Could not parse GitHub slug from ${cloudProject.repoCloneUrl}`,
				});
			}

			let repoPath: string;

			if (input.mode === "import") {
				repoPath = await importExistingRepo(input.localPath, expectedSlug);
			} else {
				repoPath = await cloneRepo(cloudProject.repoCloneUrl, input.localPath);
			}

			// Extract repo metadata from the resolved path
			const git = simpleGit(repoPath);
			const remotes = await getAllRemoteUrls(git);
			const matchingRemote = findMatchingRemote(remotes, expectedSlug);
			const remoteUrl = matchingRemote
				? remotes.get(matchingRemote)
				: undefined;
			const repoFullName = remoteUrl
				? extractGitHubSlug(remoteUrl)
				: expectedSlug;
			const [repoOwner, repoName] = repoFullName?.split("/") ?? [];

			ctx.db
				.insert(projects)
				.values({
					id: input.projectId,
					repoPath,
					repoProvider: "github",
					repoOwner,
					repoName,
					repoUrl: remoteUrl,
					remoteName: matchingRemote,
				})
				.onConflictDoUpdate({
					target: projects.id,
					set: {
						repoPath,
						repoProvider: "github",
						repoOwner,
						repoName,
						repoUrl: remoteUrl,
						remoteName: matchingRemote,
					},
				})
				.run();

			return { repoPath };
		}),

	// TODO: remove
	remove: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return { success: true };
			}

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.remove] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				rmSync(localProject.repoPath, { recursive: true, force: true });
			} catch (err) {
				console.warn("[project.remove] failed to remove repo dir", {
					projectId: input.projectId,
					repoPath: localProject.repoPath,
					err,
				});
			}

			ctx.db.delete(projects).where(eq(projects.id, input.projectId)).run();

			return { success: true };
		}),
});

async function importExistingRepo(
	localPath: string,
	expectedSlug: string,
): Promise<string> {
	if (!existsSync(localPath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Path does not exist: ${localPath}`,
		});
	}

	const stat = statSync(localPath);
	if (!stat.isDirectory()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Path is not a directory: ${localPath}`,
		});
	}

	const git = simpleGit(localPath);

	let gitRoot: string;
	try {
		gitRoot = (await git.revparse(["--show-toplevel"])).trim();
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Not a git repository: ${localPath}`,
		});
	}

	const remotes = await getAllRemoteUrls(simpleGit(gitRoot));
	const matchingRemote = findMatchingRemote(remotes, expectedSlug);

	if (!matchingRemote) {
		const found = [...remotes.entries()]
			.map(([name, url]) => `${name}: ${url}`)
			.join(", ");
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No remote matches ${expectedSlug}. Found: ${found || "no remotes"}`,
		});
	}

	return gitRoot;
}

async function cloneRepo(
	repoCloneUrl: string,
	parentDir: string,
): Promise<string> {
	if (!existsSync(parentDir)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Parent directory does not exist: ${parentDir}`,
		});
	}

	const repoName = extractRepoNameFromUrl(repoCloneUrl);
	const targetPath = join(parentDir, repoName);

	if (existsSync(targetPath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Directory already exists: ${targetPath}`,
		});
	}

	await simpleGit().clone(repoCloneUrl, targetPath);

	return targetPath;
}

function extractRepoNameFromUrl(url: string): string {
	// Handle both https://github.com/owner/repo.git and git@github.com:owner/repo.git
	const slug = extractGitHubSlug(url);
	if (slug) {
		return slug.split("/")[1] ?? basename(url, ".git");
	}
	return basename(url, ".git");
}
