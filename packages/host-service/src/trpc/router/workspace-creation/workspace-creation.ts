import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
} from "./utils/sanitize-branch";

// ── Helpers ──────────────────────────────────────────────────────────

function safeResolveWorktreePath(repoPath: string, branchName: string): string {
	const worktreesRoot = resolve(repoPath, ".worktrees");
	const worktreePath = resolve(worktreesRoot, branchName);
	if (
		worktreePath !== worktreesRoot &&
		!worktreePath.startsWith(worktreesRoot + sep)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid branch name: path traversal detected (${branchName})`,
		});
	}
	return worktreePath;
}

async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<{ owner: string; name: string }> {
	const cloudProject = await ctx.api.v2Project.get.query({
		organizationId: ctx.organizationId,
		id: projectId,
	});
	const repo = cloudProject.githubRepository;
	if (!repo?.owner || !repo?.name) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project has no linked GitHub repository",
		});
	}
	return { owner: repo.owner, name: repo.name };
}

async function listBranchNames(
	ctx: HostServiceContext,
	repoPath: string,
): Promise<string[]> {
	const git = await ctx.git(repoPath);
	try {
		const raw = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short)",
			"refs/heads/",
			"refs/remotes/origin/",
		]);
		const names = new Set<string>();
		for (const line of raw.trim().split("\n").filter(Boolean)) {
			let name = line;
			if (name.startsWith("origin/")) name = name.slice("origin/".length);
			if (name !== "HEAD") names.add(name);
		}
		return Array.from(names);
	} catch {
		return [];
	}
}

// ── Router ───────────────────────────────────────────────────────────

export const workspaceCreationRouter = router({
	getContext: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return {
					projectId: input.projectId,
					hasLocalRepo: false,
					defaultBranch: null as string | null,
				};
			}

			const git = await ctx.git(localProject.repoPath);
			let defaultBranch: string | null = null;
			try {
				const originHead = await git.raw([
					"symbolic-ref",
					"refs/remotes/origin/HEAD",
					"--short",
				]);
				defaultBranch = originHead.trim().replace("origin/", "");
			} catch {
				defaultBranch = "main";
			}

			return {
				projectId: input.projectId,
				hasLocalRepo: true,
				defaultBranch,
			};
		}),

	searchBranches: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(500).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return {
					defaultBranch: null as string | null,
					branches: [] as Array<{
						name: string;
						lastCommitDate: number;
						isLocal: boolean;
						hasWorkspace: boolean;
					}>,
				};
			}

			const git = await ctx.git(localProject.repoPath);

			let defaultBranch: string | null = null;
			try {
				const originHead = await git.raw([
					"symbolic-ref",
					"refs/remotes/origin/HEAD",
					"--short",
				]);
				defaultBranch = originHead.trim().replace("origin/", "");
			} catch {
				defaultBranch = "main";
			}

			const localBranchNames = new Set<string>();
			try {
				const raw = await git.raw([
					"branch",
					"--list",
					"--format=%(refname:short)",
				]);
				for (const name of raw.trim().split("\n").filter(Boolean)) {
					localBranchNames.add(name);
				}
			} catch {
				// ignore
			}

			type BranchInfo = {
				name: string;
				lastCommitDate: number;
				isLocal: boolean;
			};
			const branchMap = new Map<string, BranchInfo>();
			try {
				const raw = await git.raw([
					"for-each-ref",
					"--sort=-committerdate",
					"--format=%(refname:short)\t%(committerdate:unix)",
					"refs/heads/",
					"refs/remotes/origin/",
				]);
				for (const line of raw.trim().split("\n").filter(Boolean)) {
					const [rawRef, ts] = line.split("\t");
					if (!rawRef) continue;
					let name = rawRef;
					if (name.startsWith("origin/")) name = name.slice("origin/".length);
					if (name === "HEAD") continue;
					if (!branchMap.has(name)) {
						branchMap.set(name, {
							name,
							lastCommitDate: Number.parseInt(ts ?? "0", 10),
							isLocal: localBranchNames.has(name),
						});
					}
				}
			} catch {
				// ignore
			}

			let branches = Array.from(branchMap.values());

			if (input.query) {
				const q = input.query.toLowerCase();
				branches = branches.filter((b) => b.name.toLowerCase().includes(q));
			}

			branches = branches.slice(0, input.limit ?? 200);

			const localWorkspaceBranches = new Set(
				ctx.db
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.all()
					.map((w) => w.branch),
			);

			return {
				defaultBranch,
				branches: branches.map((b) => ({
					...b,
					hasWorkspace: localWorkspaceBranches.has(b.name),
				})),
			};
		}),

	/**
	 * Create a new workspace. Always creates — never opens an existing one.
	 * Branch name is sanitized and deduplicated server-side.
	 */
	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				names: z.object({
					workspaceName: z.string(),
					branchName: z.string(),
				}),
				composer: z.object({
					prompt: z.string().optional(),
					compareBaseBranch: z.string().optional(),
					runSetupScript: z.boolean().optional(),
				}),
				linkedContext: z
					.object({
						internalIssueIds: z.array(z.string()).optional(),
						githubIssueUrls: z.array(z.string()).optional(),
						linkedPrUrl: z.string().optional(),
						attachments: z
							.array(
								z.object({
									data: z.string(),
									mediaType: z.string(),
									filename: z.string().optional(),
								}),
							)
							.optional(),
					})
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const deviceClientId = getHashedDeviceId();
			const deviceName = getDeviceName();

			// 1. Resolve / ensure project locally
			let localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				const cloudProject = await ctx.api.v2Project.get.query({
					organizationId: ctx.organizationId,
					id: input.projectId,
				});

				if (!cloudProject.repoCloneUrl) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Project has no linked GitHub repository — cannot clone",
					});
				}

				const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
				const repoPath = join(homeDir, ".superset", "repos", input.projectId);

				if (!existsSync(repoPath)) {
					mkdirSync(dirname(repoPath), { recursive: true });
					await simpleGit().clone(cloudProject.repoCloneUrl, repoPath);
				}

				localProject = ctx.db
					.insert(projects)
					.values({ id: input.projectId, repoPath })
					.returning()
					.get();
			}

			// 2. Sanitize + deduplicate branch name
			const sanitizedBranch = sanitizeBranchNameWithMaxLength(
				input.names.branchName,
			);
			if (!sanitizedBranch) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Branch name is empty after sanitization",
				});
			}

			const existingBranches = await listBranchNames(
				ctx,
				localProject.repoPath,
			);
			const branchName = deduplicateBranchName(
				sanitizedBranch,
				existingBranches,
			);

			// 3. Create worktree
			const worktreePath = safeResolveWorktreePath(
				localProject.repoPath,
				branchName,
			);

			const git = await ctx.git(localProject.repoPath);
			const baseBranch = input.composer.compareBaseBranch || "HEAD";

			try {
				await git.raw(["worktree", "add", worktreePath, branchName]);
			} catch (existingBranchErr) {
				console.warn(
					"[workspaceCreation.create] worktree add for existing branch failed, creating new branch",
					{ branchName, existingBranchErr },
				);
				await git.raw([
					"worktree",
					"add",
					"-b",
					branchName,
					worktreePath,
					baseBranch,
				]);
			}

			// 4. Register cloud workspace row
			const host = await ctx.api.device.ensureV2Host.mutate({
				organizationId: ctx.organizationId,
				machineId: deviceClientId,
				name: deviceName,
			});

			const rollbackWorktree = async () => {
				try {
					await git.raw(["worktree", "remove", worktreePath]);
				} catch (err) {
					console.warn(
						"[workspaceCreation.create] failed to rollback worktree",
						{ worktreePath, err },
					);
				}
			};

			const cloudRow = await ctx.api.v2Workspace.create
				.mutate({
					organizationId: ctx.organizationId,
					projectId: input.projectId,
					name: input.names.workspaceName,
					branch: branchName,
					hostId: host.id,
				})
				.catch(async (err) => {
					await rollbackWorktree();
					throw err;
				});

			if (!cloudRow) {
				await rollbackWorktree();
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Cloud workspace create returned no row",
				});
			}

			ctx.db
				.insert(workspaces)
				.values({
					id: cloudRow.id,
					projectId: input.projectId,
					worktreePath,
					branch: branchName,
				})
				.run();

			// 5. Run setup script if requested
			if (input.composer.runSetupScript) {
				try {
					const setupScriptPath = join(worktreePath, ".superset", "setup.sh");
					if (existsSync(setupScriptPath)) {
						execSync(`bash "${setupScriptPath}"`, {
							cwd: worktreePath,
							timeout: 60_000,
							stdio: "pipe",
						});
					}
				} catch (err) {
					console.warn(
						"[workspaceCreation.create] setup script failed (non-fatal)",
						{ worktreePath, err },
					);
					// Non-fatal — workspace is still usable
				}
			}

			return {
				workspace: cloudRow,
				warnings: [] as string[],
			};
		}),

	// ── GitHub endpoints for the link commands ────────────────────────

	searchGitHubIssues: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(100).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const octokit = await ctx.github();
			const limit = input.limit ?? 30;

			try {
				if (input.query?.trim()) {
					const q = `repo:${repo.owner}/${repo.name} is:issue is:open in:title,body ${input.query}`;
					const { data } = await octokit.search.issuesAndPullRequests({
						q,
						per_page: limit,
					});
					return {
						issues: data.items
							.filter((item) => !item.pull_request)
							.map((item) => ({
								issueNumber: item.number,
								title: item.title,
								url: item.html_url,
								state: item.state,
								authorLogin: item.user?.login ?? null,
							})),
					};
				}

				const { data } = await octokit.issues.listForRepo({
					owner: repo.owner,
					repo: repo.name,
					state: "open",
					per_page: limit,
				});
				return {
					issues: data
						.filter((item) => !item.pull_request)
						.map((item) => ({
							issueNumber: item.number,
							title: item.title,
							url: item.html_url,
							state: item.state,
							authorLogin: item.user?.login ?? null,
						})),
				};
			} catch (err) {
				console.warn("[workspaceCreation.searchGitHubIssues] failed", err);
				return { issues: [] };
			}
		}),

	searchPullRequests: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(100).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const octokit = await ctx.github();
			const limit = input.limit ?? 30;

			try {
				if (input.query?.trim()) {
					const q = `repo:${repo.owner}/${repo.name} is:pr in:title ${input.query}`;
					const { data } = await octokit.search.issuesAndPullRequests({
						q,
						per_page: limit,
					});
					return {
						pullRequests: data.items
							.filter((item) => item.pull_request)
							.map((item) => ({
								prNumber: item.number,
								title: item.title,
								url: item.html_url,
								state: item.state,
								isDraft: item.draft ?? false,
								authorLogin: item.user?.login ?? null,
							})),
					};
				}

				const { data } = await octokit.pulls.list({
					owner: repo.owner,
					repo: repo.name,
					state: "open",
					sort: "updated",
					direction: "desc",
					per_page: limit,
				});
				return {
					pullRequests: data.map((pr) => ({
						prNumber: pr.number,
						title: pr.title,
						url: pr.html_url,
						state: pr.state,
						isDraft: pr.draft ?? false,
						authorLogin: pr.user?.login ?? null,
					})),
				};
			} catch (err) {
				console.warn("[workspaceCreation.searchPullRequests] failed", err);
				return { pullRequests: [] };
			}
		}),

	getGitHubIssueContent: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				issueNumber: z.number().int().positive(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const octokit = await ctx.github();
			try {
				const { data } = await octokit.issues.get({
					owner: repo.owner,
					repo: repo.name,
					issue_number: input.issueNumber,
				});
				return {
					number: data.number,
					title: data.title,
					body: data.body ?? "",
					url: data.html_url,
					state: data.state,
					author: data.user?.login ?? null,
					createdAt: data.created_at,
					updatedAt: data.updated_at,
				};
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}),
});
