import { existsSync, rmSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { parseGitHubRemote } from "../../../runtime/pull-requests/utils/parse-github-remote";
import { protectedProcedure, router } from "../../index";
import {
	findMatchingRemote,
	getGitHubRemotes,
	type ParsedGitHubRemote,
} from "./utils/git-remote";

interface ResolvedRepo {
	repoPath: string;
	matchingRemote: string;
	parsed: ParsedGitHubRemote;
}

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

			const expectedParsed = parseGitHubRemote(cloudProject.repoCloneUrl);
			if (!expectedParsed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Could not parse GitHub remote from ${cloudProject.repoCloneUrl}`,
				});
			}

			const expectedSlug = `${expectedParsed.owner}/${expectedParsed.name}`;

			let resolved: ResolvedRepo;

			if (input.mode === "import") {
				resolved = await importExistingRepo(input.localPath, expectedSlug);
			} else {
				resolved = await cloneRepo(
					cloudProject.repoCloneUrl,
					input.localPath,
					expectedSlug,
				);
			}

			ctx.db
				.insert(projects)
				.values({
					id: input.projectId,
					repoPath: resolved.repoPath,
					repoProvider: "github",
					repoOwner: resolved.parsed.owner,
					repoName: resolved.parsed.name,
					repoUrl: resolved.parsed.url,
					remoteName: resolved.matchingRemote,
				})
				.onConflictDoUpdate({
					target: projects.id,
					set: {
						repoPath: resolved.repoPath,
						repoProvider: "github",
						repoOwner: resolved.parsed.owner,
						repoName: resolved.parsed.name,
						repoUrl: resolved.parsed.url,
						remoteName: resolved.matchingRemote,
					},
				})
				.run();

			return { repoPath: resolved.repoPath };
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
): Promise<ResolvedRepo> {
	if (!existsSync(localPath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Path does not exist: ${localPath}`,
		});
	}

	if (!statSync(localPath).isDirectory()) {
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

	const remotes = await getGitHubRemotes(simpleGit(gitRoot));
	const matchingRemote = findMatchingRemote(remotes, expectedSlug);

	if (!matchingRemote) {
		const found = [...remotes.entries()]
			.map(([name, parsed]) => `${name}: ${parsed.owner}/${parsed.name}`)
			.join(", ");
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No remote matches ${expectedSlug}. Found: ${found || "no remotes"}`,
		});
	}

	const parsed = remotes.get(matchingRemote);
	if (!parsed) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Remote "${matchingRemote}" matched but has no parsed data`,
		});
	}

	return { repoPath: gitRoot, matchingRemote, parsed };
}

async function cloneRepo(
	repoCloneUrl: string,
	parentDir: string,
	expectedSlug: string,
): Promise<ResolvedRepo> {
	const resolvedParentDir = resolve(parentDir);

	if (!existsSync(resolvedParentDir)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Parent directory does not exist: ${resolvedParentDir}`,
		});
	}

	if (!statSync(resolvedParentDir).isDirectory()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Parent path is not a directory: ${resolvedParentDir}`,
		});
	}

	const repoName = extractRepoNameFromUrl(repoCloneUrl);
	const targetPath = join(resolvedParentDir, repoName);

	if (existsSync(targetPath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Directory already exists: ${targetPath}`,
		});
	}

	try {
		await simpleGit().clone(repoCloneUrl, targetPath);
	} catch (err) {
		if (existsSync(targetPath)) {
			rmSync(targetPath, { recursive: true, force: true });
		}
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to clone repository: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	const remotes = await getGitHubRemotes(simpleGit(targetPath));
	const matchingRemote = findMatchingRemote(remotes, expectedSlug);

	if (!matchingRemote) {
		rmSync(targetPath, { recursive: true, force: true });
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cloned repo does not match expected GitHub remote",
		});
	}

	const parsed = remotes.get(matchingRemote);
	if (!parsed) {
		rmSync(targetPath, { recursive: true, force: true });
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Remote "${matchingRemote}" matched but has no parsed data`,
		});
	}

	return { repoPath: targetPath, matchingRemote, parsed };
}

function extractRepoNameFromUrl(url: string): string {
	const parsed = parseGitHubRemote(url);
	if (parsed) return parsed.name;
	return basename(url, ".git");
}
