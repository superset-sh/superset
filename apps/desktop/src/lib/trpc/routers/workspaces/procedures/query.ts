import { projects, workspaces, worktrees } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getWorkspace } from "../utils/db-helpers";
import { detectBaseBranch, hasOriginRemote } from "../utils/git";
import { getWorkspacePath } from "../utils/worktree";

type WorktreePathMap = Map<string, string>;

export const createQueryProcedures = () => {
	return router({
		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.id);
				if (!workspace) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Workspace ${input.id} not found`,
					});
				}

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();
				const worktree = workspace.worktreeId
					? localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get()
					: null;

				// Detect and persist base branch for existing worktrees that don't have it
				// We use undefined to mean "not yet attempted" and null to mean "attempted but not found"
				let baseBranch = worktree?.baseBranch;
				if (worktree && baseBranch === undefined && project) {
					// Only attempt detection if there's a remote origin
					const hasRemote = await hasOriginRemote(project.mainRepoPath);
					if (hasRemote) {
						try {
							const defaultBranch = project.defaultBranch || "main";
							const detected = await detectBaseBranch(
								worktree.path,
								worktree.branch,
								defaultBranch,
							);
							if (detected) {
								baseBranch = detected;
							}
							// Persist the result (detected branch or null sentinel)
							localDb
								.update(worktrees)
								.set({ baseBranch: detected ?? null })
								.where(eq(worktrees.id, worktree.id))
								.run();
						} catch {
							// Detection failed, persist null to avoid retrying
							localDb
								.update(worktrees)
								.set({ baseBranch: null })
								.where(eq(worktrees.id, worktree.id))
								.run();
						}
					} else {
						// No remote - persist null to avoid retrying
						localDb
							.update(worktrees)
							.set({ baseBranch: null })
							.where(eq(worktrees.id, worktree.id))
							.run();
					}
				}

				return {
					...workspace,
					type: workspace.type as "worktree" | "branch",
					worktreePath: getWorkspacePath(workspace) ?? "",
					project: project
						? {
								id: project.id,
								name: project.name,
								mainRepoPath: project.mainRepoPath,
							}
						: null,
					worktree: worktree
						? {
								branch: worktree.branch,
								baseBranch,
								// Normalize to null to ensure consistent "incomplete init" detection in UI
								gitStatus: worktree.gitStatus ?? null,
							}
						: null,
				};
			}),

		getAll: publicProcedure.query(() => {
			return localDb
				.select()
				.from(workspaces)
				.where(isNull(workspaces.deletingAt))
				.all()
				.sort((a, b) => a.tabOrder - b.tabOrder);
		}),

		getAllGrouped: publicProcedure.query(() => {
			const activeProjects = localDb
				.select()
				.from(projects)
				.where(isNotNull(projects.tabOrder))
				.all();

			// Preload all worktrees once to avoid N+1 queries in the loop below
			const allWorktrees = localDb.select().from(worktrees).all();
			const worktreePathMap: WorktreePathMap = new Map(
				allWorktrees.map((wt) => [wt.id, wt.path]),
			);

			const groupsMap = new Map<
				string,
				{
					project: {
						id: string;
						name: string;
						color: string;
						tabOrder: number;
						githubOwner: string | null;
						mainRepoPath: string;
					};
					workspaces: Array<{
						id: string;
						projectId: string;
						worktreeId: string | null;
						worktreePath: string;
						type: "worktree" | "branch";
						branch: string;
						name: string;
						tabOrder: number;
						createdAt: number;
						updatedAt: number;
						lastOpenedAt: number;
						isUnread: boolean;
					}>;
				}
			>();

			for (const project of activeProjects) {
				groupsMap.set(project.id, {
					project: {
						id: project.id,
						name: project.name,
						color: project.color,
						// biome-ignore lint/style/noNonNullAssertion: filter guarantees tabOrder is not null
						tabOrder: project.tabOrder!,
						githubOwner: project.githubOwner ?? null,
						mainRepoPath: project.mainRepoPath,
					},
					workspaces: [],
				});
			}

			const allWorkspaces = localDb
				.select()
				.from(workspaces)
				.where(isNull(workspaces.deletingAt))
				.all()
				.sort((a, b) => a.tabOrder - b.tabOrder);

			for (const workspace of allWorkspaces) {
				const group = groupsMap.get(workspace.projectId);
				if (group) {
					// Resolve path from preloaded data instead of per-workspace DB queries
					let worktreePath = "";
					if (workspace.type === "worktree" && workspace.worktreeId) {
						worktreePath = worktreePathMap.get(workspace.worktreeId) ?? "";
					} else if (workspace.type === "branch") {
						worktreePath = group.project.mainRepoPath;
					}

					group.workspaces.push({
						...workspace,
						type: workspace.type as "worktree" | "branch",
						worktreePath,
						isUnread: workspace.isUnread ?? false,
					});
				}
			}

			return Array.from(groupsMap.values()).sort(
				(a, b) => a.project.tabOrder - b.project.tabOrder,
			);
		}),

		getPreviousWorkspace: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const allWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(isNull(workspaces.deletingAt))
					.all()
					.sort((a, b) => a.tabOrder - b.tabOrder);

				const currentIndex = allWorkspaces.findIndex((w) => w.id === input.id);

				if (currentIndex > 0) {
					return allWorkspaces[currentIndex - 1].id;
				}

				return null;
			}),

		getNextWorkspace: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const allWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(isNull(workspaces.deletingAt))
					.all()
					.sort((a, b) => a.tabOrder - b.tabOrder);

				const currentIndex = allWorkspaces.findIndex((w) => w.id === input.id);

				if (currentIndex !== -1 && currentIndex < allWorkspaces.length - 1) {
					return allWorkspaces[currentIndex + 1].id;
				}

				return null;
			}),
	});
};
