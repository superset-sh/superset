import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";

/**
 * Validates that a worktree path stays within the expected parent directory
 * after path resolution. Prevents path-traversal via `..` segments in branch
 * names. Returns the resolved absolute path on success.
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

const createOutcome = z.enum([
	"created_workspace",
	"opened_existing_workspace",
	"opened_worktree",
	"adopted_external_worktree",
]);

export type CreateWorkspaceOutcome = z.infer<typeof createOutcome>;

export const workspaceCreationRouter = router({
	/**
	 * Returns contextual data needed to populate the create-workspace composer
	 * for a given project (default branch, branch count, etc.).
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
					defaultBranch: null,
					branchCount: 0,
					worktreeCount: 0,
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

			let branchCount = 0;
			try {
				const raw = await git.raw([
					"branch",
					"--list",
					"--format=%(refname:short)",
				]);
				branchCount = raw.trim().split("\n").filter(Boolean).length;
			} catch {
				// ignore
			}

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			return {
				projectId: input.projectId,
				hasLocalRepo: true,
				defaultBranch,
				branchCount,
				worktreeCount: localWorkspaces.length,
			};
		}),

	/**
	 * Search / list branches for a project's repo, enriched with worktree
	 * and workspace metadata.
	 */
	searchBranches: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				filter: z.enum(["all", "local", "remote"]).optional(),
				limit: z.number().min(1).max(500).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return { defaultBranch: null, branches: [] };
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

			// Gather local branches
			const localBranchNames = new Set<string>();
			try {
				const raw = await git.raw([
					"branch",
					"--list",
					"--format=%(refname:short)\t%(committerdate:unix)",
				]);
				for (const line of raw.trim().split("\n").filter(Boolean)) {
					const [name] = line.split("\t");
					if (name) localBranchNames.add(name);
				}
			} catch {
				// ignore
			}

			// Gather all branches (local + remote)
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
					"--format=%(refname:short)\t%(committerdate:unix)\t%(refname:lstrip=2)",
					"refs/heads/",
					"refs/remotes/origin/",
				]);

				for (const line of raw.trim().split("\n").filter(Boolean)) {
					const parts = line.split("\t");
					const refShort = parts[0] ?? "";
					const commitDate = Number.parseInt(parts[1] ?? "0", 10);

					// Normalize remote refs to just the branch name
					let name = refShort;
					if (name.startsWith("origin/")) {
						name = name.slice("origin/".length);
					}
					if (name === "HEAD") continue;

					if (!branchMap.has(name)) {
						branchMap.set(name, {
							name,
							lastCommitDate: commitDate,
							isLocal: localBranchNames.has(name),
						});
					}
				}
			} catch {
				// ignore
			}

			let branches = Array.from(branchMap.values());

			// Apply filter
			if (input.filter === "local") {
				branches = branches.filter((b) => b.isLocal);
			} else if (input.filter === "remote") {
				branches = branches.filter((b) => !b.isLocal);
			}

			// Apply search
			if (input.query) {
				const q = input.query.toLowerCase();
				branches = branches.filter((b) => b.name.toLowerCase().includes(q));
			}

			// Apply limit
			const limit = input.limit ?? 100;
			branches = branches.slice(0, limit);

			// Enrich with workspace metadata
			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			const workspaceBranches = new Set(localWorkspaces.map((ws) => ws.branch));

			return {
				defaultBranch,
				branches: branches.map((b) => ({
					...b,
					hasWorkspace: workspaceBranches.has(b.name),
				})),
			};
		}),

	/**
	 * Semantic workspace creation with full V1 outcome resolution.
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
				// `launch` (agentId/autoRun) intentionally omitted — agent
				// handoff is a Phase 2 concern. Re-add when the host-service
				// actually schedules the launch.
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

			// 2. Check for existing workspace on same branch
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

			// 3. Check for existing worktree on disk
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

				// Check if this worktree is already tracked in our local DB
				// (has a workspace row but no cloud counterpart — e.g. leftover
				// from a previous session that wasn't fully synced).
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
					// workspace id (both adopted_external_worktree and
					// created_workspace paths insert with `id = cloudRow.id`).
					// So the cloud row already exists; just return the tracked
					// row without a duplicate cloud create.
					return {
						outcome: "opened_worktree" as const,
						workspace: trackedWorktree,
						warnings: [] as string[],
					};
				}

				// External worktree — adopt it (create cloud + local rows)
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

			// 4. Create worktree + cloud workspace row
			const git = await ctx.git(localProject.repoPath);

			// Create worktree — first try adding for an existing branch; if
			// that fails, fall back to creating a new branch from baseBranch.
			// We log the original error so disk/permission/corruption issues
			// aren't silently hidden behind the fallback attempt.
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

			const host = await ctx.api.device.ensureV2Host.mutate({
				organizationId: ctx.organizationId,
				machineId: deviceClientId,
				name: deviceName,
			});

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
});
