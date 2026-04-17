import { existsSync } from "node:fs";
import type { GitHubStatus } from "@superset/local-db";
import { projects, settings, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	detectGitProvider,
	extractOnedevProjectPath,
} from "../../changes/utils/git-provider";
import {
	getProject,
	getWorkspace,
	getWorktree,
	updateProjectDefaultBranch,
} from "../utils/db-helpers";
import {
	fetchDefaultBranch,
	getAheadBehindCount,
	getDefaultBranch,
	listExternalWorktrees,
	refreshDefaultBranch,
} from "../utils/git";
import { getSimpleGitWithShellPath } from "../utils/git-client";
import {
	clearGitHubCachesForWorktree,
	fetchGitHubPRComments,
	fetchGitHubPRStatus,
	type PullRequestCommentsTarget,
	resolveReviewThread,
} from "../utils/github";

const gitHubPRCommentsInputSchema = z.object({
	workspaceId: z.string(),
	prNumber: z.number().int().positive().optional(),
	repoUrl: z.string().optional(),
	upstreamUrl: z.string().optional(),
	isFork: z.boolean().optional(),
});

function resolveCommentsPullRequestTarget({
	input,
	githubStatus,
}: {
	input: z.infer<typeof gitHubPRCommentsInputSchema>;
	githubStatus: GitHubStatus | null | undefined;
}): PullRequestCommentsTarget | null {
	const prNumber = input.prNumber ?? githubStatus?.pr?.number;
	if (!prNumber) {
		return null;
	}

	const repoUrl = input.repoUrl ?? githubStatus?.repoUrl;
	if (!repoUrl) {
		return null;
	}

	const upstreamUrl =
		input.upstreamUrl ?? githubStatus?.upstreamUrl ?? githubStatus?.repoUrl;
	if (!upstreamUrl) {
		return null;
	}

	return {
		prNumber,
		repoContext: {
			repoUrl,
			upstreamUrl,
			isFork: input.isFork ?? githubStatus?.isFork ?? false,
		},
	};
}

function stripGitHubStatusTimestamp(
	status: GitHubStatus | null | undefined,
): Omit<GitHubStatus, "lastRefreshed"> | null {
	if (!status) {
		return null;
	}

	const { lastRefreshed: _lastRefreshed, ...rest } = status;
	return rest;
}

function hasMeaningfulGitHubStatusChange({
	current,
	next,
}: {
	current: GitHubStatus | null | undefined;
	next: GitHubStatus;
}): boolean {
	return (
		JSON.stringify(stripGitHubStatusTimestamp(current)) !==
		JSON.stringify(stripGitHubStatusTimestamp(next))
	);
}

export const createGitStatusProcedures = () => {
	return router({
		refreshGitStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					throw new Error(
						`Worktree for workspace ${input.workspaceId} not found`,
					);
				}

				const project = getProject(workspace.projectId);
				if (!project) {
					throw new Error(`Project ${workspace.projectId} not found`);
				}

				const remoteDefaultBranch = await refreshDefaultBranch(
					project.mainRepoPath,
				);

				let defaultBranch = project.defaultBranch;
				if (!defaultBranch) {
					defaultBranch = await getDefaultBranch(project.mainRepoPath);
				}
				if (remoteDefaultBranch && remoteDefaultBranch !== defaultBranch) {
					defaultBranch = remoteDefaultBranch;
				}

				if (defaultBranch !== project.defaultBranch) {
					updateProjectDefaultBranch(project.id, defaultBranch);
				}

				await fetchDefaultBranch(project.mainRepoPath, defaultBranch);

				const { ahead, behind } = await getAheadBehindCount({
					repoPath: worktree.path,
					defaultBranch,
				});

				const gitStatus = {
					branch: worktree.branch,
					needsRebase: behind > 0,
					ahead,
					behind,
					lastRefreshed: Date.now(),
				};

				localDb
					.update(worktrees)
					.set({ gitStatus })
					.where(eq(worktrees.id, worktree.id))
					.run();

				return { gitStatus, defaultBranch };
			}),

		getAheadBehind: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return { ahead: 0, behind: 0 };
				}

				const project = getProject(workspace.projectId);
				if (!project) {
					return { ahead: 0, behind: 0 };
				}

				return getAheadBehindCount({
					repoPath: project.mainRepoPath,
					defaultBranch: workspace.branch,
				});
			}),

		getGitHubStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return null;
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return null;
				}

				const freshStatus = await fetchGitHubPRStatus(worktree.path);

				if (
					freshStatus &&
					hasMeaningfulGitHubStatusChange({
						current: worktree.githubStatus,
						next: freshStatus,
					})
				) {
					localDb
						.update(worktrees)
						.set({ githubStatus: freshStatus })
						.where(eq(worktrees.id, worktree.id))
						.run();
					return freshStatus;
				}

				// Fallback: check OneDev for PRs
				try {
					const settingsRow = localDb.select().from(settings).get();
					const onedevUrl = settingsRow?.onedevUrl ?? null;
					const onedevToken = settingsRow?.onedevAccessToken ?? null;
					if (onedevUrl && onedevToken) {
						const git = await getSimpleGitWithShellPath(worktree.path);
						const remoteUrl = (await git.remote(["get-url", "origin"])).trim();
						const provider = detectGitProvider(remoteUrl, onedevUrl);
						if (provider === "onedev") {
							const projectPath = extractOnedevProjectPath(remoteUrl);
							if (projectPath) {
								const { createOnedevClient } = await import("../../changes/utils/onedev-api");
								const client = createOnedevClient({ url: onedevUrl, accessToken: onedevToken });
								const projectInfo = await client.getProjectByPath(projectPath);
								if (projectInfo) {
									const branch = worktree.branch;
									const existingPR = await client.findOpenPRWithUrl(projectInfo.id, branch, projectPath);
									if (existingPR) {
										return {
											pr: {
												number: existingPR.number,
												state: "open" as const,
												url: existingPR.url,
												title: existingPR.title ?? "",
												additions: 0,
												deletions: 0,
												reviewDecision: "pending" as const,
												checksStatus: "none" as const,
												checks: [],
											},
											repoUrl: `${onedevUrl}/${projectPath}`,
											branchExistsOnRemote: true,
											lastRefreshed: Date.now(),
										};
									}
								}
							}
						}
					}
				} catch (err) {
					console.error("[getGitHubStatus] OneDev fallback error:", err);
				}

				return freshStatus;
			}),

		getGitProvider: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return { provider: "unknown" as const };
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return { provider: "unknown" as const };
				}

				try {
					const git = await getSimpleGitWithShellPath(worktree.path);
					const remoteUrl = (await git.remote(["get-url", "origin"])).trim();

					const settingsRow = localDb.select().from(settings).get();
					const onedevUrl = settingsRow?.onedevUrl ?? null;

					return {
						provider: detectGitProvider(remoteUrl, onedevUrl),
					};
				} catch {
					return { provider: "unknown" as const };
				}
			}),

		getProjectGitProvider: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					return { provider: "unknown" as const, onedevProjectPath: null };
				}

				try {
					const git = await getSimpleGitWithShellPath(project.mainRepoPath);
					const remoteUrl = (await git.remote(["get-url", "origin"])).trim();

					const settingsRow = localDb.select().from(settings).get();
					const onedevUrl = settingsRow?.onedevUrl ?? null;

					const provider = detectGitProvider(remoteUrl, onedevUrl);
					const onedevProjectPath =
						provider === "onedev" ? extractOnedevProjectPath(remoteUrl) : null;

					return { provider, onedevProjectPath };
				} catch {
					return { provider: "unknown" as const, onedevProjectPath: null };
				}
			}),

		getOnedevProjectPaths: publicProcedure.query(async () => {
			const settingsRow = localDb.select().from(settings).get();
			const onedevUrl = settingsRow?.onedevUrl ?? null;
			if (!onedevUrl) return [];

			const allProjects = localDb.select().from(projects).all();
			console.log(
				`[onedev] Checking ${allProjects.length} projects for OneDev remotes (onedevUrl=${onedevUrl})`,
			);
			const results: string[] = [];

			for (const project of allProjects) {
				try {
					const git = await getSimpleGitWithShellPath(
						project.mainRepoPath,
					);
					const remotes = await git.getRemotes(true);
					const origin = remotes.find((r) => r.name === "origin");
					if (!origin?.refs?.fetch) {
						console.log(
							`[onedev] No origin remote for ${project.mainRepoPath}`,
						);
						continue;
					}
					const remoteUrl = origin.refs.fetch.trim();
					console.log(
						`[onedev] Project ${project.name}: remote=${remoteUrl}`,
					);
					const provider = detectGitProvider(remoteUrl, onedevUrl);
					if (provider === "onedev") {
						const path = extractOnedevProjectPath(remoteUrl);
						console.log(
							`[onedev] Found OneDev project: ${path}`,
						);
						if (path) results.push(path);
					}
				} catch (error) {
					console.error(
						`[onedev] Failed to check project ${project.mainRepoPath}:`,
						error,
					);
				}
			}

			console.log(`[onedev] Found ${results.length} OneDev projects`);
			return results;
		}),

		getOnedevPRStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				console.log("[getOnedevPRStatus] Called with workspaceId:", input.workspaceId);
				const settingsRow = localDb.select().from(settings).get();
				const onedevUrl = settingsRow?.onedevUrl ?? null;
				const onedevToken = settingsRow?.onedevAccessToken ?? null;
				if (!onedevUrl || !onedevToken) {
					console.log("[getOnedevPRStatus] No OneDev config");
					return null;
				}

				// Find workspace and its project
				const workspace = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, input.workspaceId))
					.get();
				if (!workspace) return null;

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();
				if (!project) return null;

				try {
					const git = await getSimpleGitWithShellPath(project.mainRepoPath);
					const remotes = await git.getRemotes(true);
					const origin = remotes.find((r) => r.name === "origin");
					if (!origin?.refs?.fetch) return null;

					const provider = detectGitProvider(origin.refs.fetch, onedevUrl);
					if (provider !== "onedev") return null;

					const projectPath = extractOnedevProjectPath(origin.refs.fetch);
					if (!projectPath) return null;

					// Find open PR for this branch
					const branch = workspace.branch;
					const baseUrl = onedevUrl.replace(/\/+$/, "");
					const { createOnedevClient } = await import("../../changes/utils/onedev-api");
					const client = createOnedevClient({ url: onedevUrl, accessToken: onedevToken });
					const projectInfo = await client.getProjectByPath(projectPath);
					if (!projectInfo) return null;

					const existingPR = await client.findOpenPRWithUrl(
						projectInfo.id,
						branch,
						projectPath,
					);

					console.log("[getOnedevPRStatus] existingPR:", existingPR ? `#${existingPR.number}` : "null");
					if (!existingPR) return null;

					return {
						pr: {
							number: existingPR.number,
							state: "open" as const,
							url: existingPR.url,
							title: existingPR.title ?? "",
						},
					};
				} catch (error) {
					console.error("[getOnedevPRStatus] Error:", String(error));
					return null;
				}
			}),

		getGitHubPRComments: publicProcedure
			.input(gitHubPRCommentsInputSchema)
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return [];
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return [];
				}

				const cachedGitHubStatus = worktree.githubStatus ?? null;

				return fetchGitHubPRComments({
					worktreePath: worktree.path,
					pullRequest: resolveCommentsPullRequestTarget({
						input,
						githubStatus: cachedGitHubStatus,
					}),
				});
			}),

		resolveReviewThread: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					threadId: z.string(),
					resolve: z.boolean(),
				}),
			)
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					throw new Error(
						`Worktree for workspace ${input.workspaceId} not found`,
					);
				}

				await resolveReviewThread({
					worktreePath: worktree.path,
					threadId: input.threadId,
					resolve: input.resolve,
				});

				clearGitHubCachesForWorktree(worktree.path);
			}),

		getWorktreeInfo: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return null;
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return null;
				}

				const worktreeName = worktree.path.split("/").pop() ?? worktree.branch;
				const branchName = worktree.branch;

				return {
					worktreeName,
					branchName,
					createdAt: worktree.createdAt,
					gitStatus: worktree.gitStatus ?? null,
					githubStatus: worktree.githubStatus ?? null,
				};
			}),

		getWorktreesByProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const projectWorktrees = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.projectId, input.projectId))
					.all();

				return projectWorktrees.map((wt) => {
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.worktreeId, wt.id),
								isNull(workspaces.deletingAt),
							),
						)
						.get();
					return {
						...wt,
						hasActiveWorkspace: workspace !== undefined,
						existsOnDisk: existsSync(wt.path),
						workspace: workspace ?? null,
					};
				});
			}),

		getExternalWorktrees: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					return [];
				}

				const allWorktrees = await listExternalWorktrees(project.mainRepoPath);

				const trackedWorktrees = localDb
					.select({ path: worktrees.path })
					.from(worktrees)
					.where(eq(worktrees.projectId, input.projectId))
					.all();
				const trackedPaths = new Set(trackedWorktrees.map((wt) => wt.path));

				return allWorktrees
					.filter((wt) => {
						if (wt.path === project.mainRepoPath) return false;
						if (wt.isBare) return false;
						if (wt.isDetached) return false;
						if (!wt.branch) return false;
						if (trackedPaths.has(wt.path)) return false;
						return true;
					})
					.map((wt) => ({
						path: wt.path,
						// biome-ignore lint/style/noNonNullAssertion: filtered above
						branch: wt.branch!,
					}));
			}),
	});
};
