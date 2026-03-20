import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { generateBranchNameFromPrompt } from "../utils/ai-branch-name";
import { resolveBranchPrefix } from "../utils/branch-prefix";
import { listBranches } from "../utils/git";

export const createGenerateBranchNameProcedures = () => {
	return router({
		generateBranchName: publicProcedure
			.input(
				z.object({
					prompt: z.string(),
					projectId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const trimmedPrompt = input.prompt.trim();
				if (!trimmedPrompt) {
					return { branchName: null };
				}

				// Get project to access repo path
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				// Get existing branches to check for conflicts
				let existingBranches: string[];
				try {
					const { local, remote } = await listBranches(project.mainRepoPath);
					existingBranches = local.concat(remote);
				} catch (error) {
					console.warn(
						"[generateBranchName] Failed to list branches, proceeding without conflict checking:",
						error,
					);
					// Fall back to no conflict checking if listing branches fails
					existingBranches = [];
				}

				// Resolve branch prefix using shared utility
				let branchPrefix: string | undefined;
				try {
					branchPrefix = await resolveBranchPrefix(project, existingBranches);
				} catch (error) {
					console.warn(
						"[generateBranchName] Failed to resolve branch prefix:",
						error,
					);
					branchPrefix = undefined;
				}

				const branchName = await generateBranchNameFromPrompt(
					trimmedPrompt,
					existingBranches,
					branchPrefix,
				);
				return { branchName };
			}),
	});
};
