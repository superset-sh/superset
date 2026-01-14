import { projects, workspaces } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	getBranchWorkspace,
	getWorkspace,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../utils/db-helpers";
import { listBranches, safeCheckoutBranch } from "../utils/git";

export const createBranchProcedures = () => {
	return router({
		getBranches: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fetch: z.boolean().optional(), // Whether to fetch remote refs (default: false, avoids UI stalls)
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branches = await listBranches(project.mainRepoPath, {
					fetch: input.fetch,
				});

				// Get branches that are in use by worktrees, with their workspace IDs
				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.projectId, input.projectId),
							isNull(workspaces.deletingAt),
						),
					)
					.all();
				const worktreeBranchMap: Record<string, string> = {};
				for (const ws of projectWorkspaces) {
					if (ws.type === "worktree" && ws.branch) {
						worktreeBranchMap[ws.branch] = ws.id;
					}
				}

				return {
					...branches,
					inUse: Object.keys(worktreeBranchMap),
					inUseWorkspaces: worktreeBranchMap, // branch -> workspaceId
				};
			}),

		// Switch an existing branch workspace to a different branch
		switchBranchWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const workspace = getBranchWorkspace(input.projectId);
				if (!workspace) {
					throw new Error("No branch workspace found for this project");
				}

				// Checkout the new branch with safety checks (terminals continue running on the new branch)
				await safeCheckoutBranch(project.mainRepoPath, input.branch);

				// Send newline to terminals so their prompts refresh with new branch
				getWorkspaceRuntimeRegistry()
					.getForWorkspaceId(workspace.id)
					.terminal.refreshPromptsForWorkspace(workspace.id);

				// Update the workspace - name is always the branch for branch workspaces
				touchWorkspace(workspace.id, {
					branch: input.branch,
					name: input.branch,
				});
				setLastActiveWorkspace(workspace.id);

				const updatedWorkspace = getWorkspace(workspace.id);
				if (!updatedWorkspace) {
					throw new Error(`Workspace ${workspace.id} not found after update`);
				}

				return {
					workspace: updatedWorkspace,
					worktreePath: project.mainRepoPath,
				};
			}),
	});
};
