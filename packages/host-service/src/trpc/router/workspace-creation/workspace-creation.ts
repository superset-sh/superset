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

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Validates that a resolved worktree path stays within the expected
 * `repoPath/.worktrees/` directory. Prevents path-traversal via `..`
 * segments in branch names.
 */
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

/**
 * Resolves a V2 project's GitHub repo (owner + name) via the cloud API.
 * Throws BAD_REQUEST if the project has no linked GitHub repository.
 */
async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<{ owner: string; name: string }> {
	const cloudProject = await ctx.api.v2Project.get.query({ id: projectId });
	const repo = cloudProject.githubRepository;
	if (!repo?.owner || !repo?.name) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project has no linked GitHub repository",
		});
	}
	return { owner: repo.owner, name: repo.name };
}

// ── Router ───────────────────────────────────────────────────────────

export const workspaceCreationRouter = router({
	/**
	 * Returns contextual data for the create-workspace composer.
	 * Currently just confirms local repo state + default branch; the
	 * composer can use this to drive UI affordances.
	 */
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

	/**
	 * Lists / searches branches for the given project, enriched with
	 * workspace metadata. Uses the local host-service DB + git.
	 */
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

			// Gather local branch names (so we can mark isLocal).
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

			// Gather all branches sorted by recent commit date.
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
					if (name.startsWith("origin/")) {
						name = name.slice("origin/".length);
					}
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

			const limit = input.limit ?? 200;
			branches = branches.slice(0, limit);

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
	 * Semantic workspace creation. Handles clone, worktree add, cloud
	 * registration, and outcome resolution (create vs open-existing vs
	 * open-tracked-worktree vs adopt-external-worktree).
	 */
	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				source: z.enum(["prompt", "pull-request", "branch", "issue"]),
				names: z.object({
					workspaceName: z.string().optional(),
					branchName: z.string().optional(),
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
				behavior: z
					.object({
						onExistingWorkspace: z
							.enum(["open", "error"])
							.optional()
							.default("open"),
						onExistingWorktree: z
							.enum(["adopt", "error"])
							.optional()
							.default("adopt"),
					})
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const branchName =
				input.names.branchName || input.names.workspaceName || "workspace";
			const workspaceName =
				input.names.workspaceName || input.names.branchName || "workspace";
			const deviceClientId = getHashedDeviceId();
			const deviceName = getDeviceName();

			// 1. Resolve / ensure project locally
			let localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				const cloudProject = await ctx.api.v2Project.get.query({
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

				const inserted = ctx.db
					.insert(projects)
					.values({ id: input.projectId, repoPath })
					.returning()
					.get();

				localProject = inserted;
			}

			// 2. Existing workspace on same branch → open it
			const existingWorkspace = ctx.db.query.workspaces
				.findFirst({
					where: (ws, { and, eq: eqFn }) =>
						and(
							eqFn(ws.projectId, input.projectId),
							eqFn(ws.branch, branchName),
						),
				})
				.sync();

			if (existingWorkspace) {
				if (input.behavior?.onExistingWorkspace === "error") {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Workspace already exists for branch ${branchName}`,
					});
				}
				return {
					outcome: "opened_existing_workspace" as const,
					workspace: existingWorkspace,
					warnings: [] as string[],
				};
			}

			// 3. Existing worktree on disk → distinguish tracked vs external
			const worktreePath = safeResolveWorktreePath(
				localProject.repoPath,
				branchName,
			);

			if (existsSync(worktreePath)) {
				if (input.behavior?.onExistingWorktree === "error") {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Worktree already exists at ${worktreePath}`,
					});
				}

				// Check if this worktree path is already tracked in the local DB.
				const trackedWorktree = ctx.db.query.workspaces
					.findFirst({
						where: (ws, { and, eq: eqFn }) =>
							and(
								eqFn(ws.projectId, input.projectId),
								eqFn(ws.worktreePath, worktreePath),
							),
					})
					.sync();

				if (trackedWorktree) {
					// Tracked worktree — the local row's id *is* the cloud
					// workspace id, so the cloud row already exists. Return it.
					return {
						outcome: "opened_worktree" as const,
						workspace: trackedWorktree,
						warnings: [] as string[],
					};
				}

				// External worktree — register a new cloud + local row.
				const host = await ctx.api.device.ensureV2Host.mutate({
					organizationId: ctx.organizationId,
					machineId: deviceClientId,
					name: deviceName,
				});

				const cloudRow = await ctx.api.v2Workspace.create.mutate({
					projectId: input.projectId,
					name: workspaceName,
					branch: branchName,
					hostId: host.id,
				});

				if (!cloudRow) {
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

				return {
					outcome: "adopted_external_worktree" as const,
					workspace: cloudRow,
					warnings: [] as string[],
				};
			}

			// 4. Create a new worktree + cloud workspace row
			const git = await ctx.git(localProject.repoPath);

			// Try adding for an existing branch first; fall back to creating a
			// new branch from baseBranch if that fails. Log the original error
			// so disk/permission/corruption failures aren't hidden.
			try {
				await git.raw(["worktree", "add", worktreePath, branchName]);
			} catch (existingBranchErr) {
				console.warn(
					"[workspaceCreation.create] worktree add for existing branch failed, trying new branch",
					{ branchName, worktreePath, existingBranchErr },
				);
				const baseBranch = input.composer.compareBaseBranch || "HEAD";
				await git.raw([
					"worktree",
					"add",
					"-b",
					branchName,
					worktreePath,
					baseBranch,
				]);
			}

			const rollbackWorktree = async () => {
				try {
					await git.raw(["worktree", "remove", worktreePath]);
				} catch (cleanupErr) {
					console.warn(
						"[workspaceCreation.create] failed to rollback worktree",
						{ worktreePath, cleanupErr },
					);
				}
			};

			const host = await ctx.api.device.ensureV2Host.mutate({
				organizationId: ctx.organizationId,
				machineId: deviceClientId,
				name: deviceName,
			});

			const cloudRow = await ctx.api.v2Workspace.create
				.mutate({
					projectId: input.projectId,
					name: workspaceName,
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

			return {
				outcome: "created_workspace" as const,
				workspace: cloudRow,
				warnings: [] as string[],
			};
		}),

	/**
	 * Searches GitHub issues for a V2 project's linked repo via Octokit.
	 * Used by the GitHub-issue link command in the composer.
	 */
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
					// Server-side search by title/body across open issues.
					const q = `repo:${repo.owner}/${repo.name} is:issue is:open in:title,body ${input.query}`;
					const { data } = await octokit.search.issuesAndPullRequests({
						q,
						per_page: limit,
					});
					return {
						issues: data.items
							.filter((item) => !item.pull_request) // Exclude PRs
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
						.filter((item) => !item.pull_request) // Exclude PRs
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

	/**
	 * Searches pull requests for a V2 project's linked repo via Octokit.
	 * Used by the PR link command in the composer.
	 */
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

	/**
	 * Fetches a GitHub issue's full content (title + body + metadata)
	 * for attaching as markdown to an agent launch.
	 */
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
