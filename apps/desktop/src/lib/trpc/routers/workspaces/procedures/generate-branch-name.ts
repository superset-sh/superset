import { projects, settings } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { generateBranchNameFromPrompt } from "../utils/ai-branch-name";
import {
	getBranchPrefix,
	listBranches,
	sanitizeAuthorPrefix,
} from "../utils/git";

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

				// Calculate branch prefix (same logic as create.ts) to check conflicts correctly
				let branchPrefix: string | undefined;
				try {
					const globalSettings = localDb.select().from(settings).get();
					const projectOverrides = project.branchPrefixMode != null;
					const prefixMode = projectOverrides
						? project.branchPrefixMode
						: (globalSettings?.branchPrefixMode ?? "none");
					const customPrefix = projectOverrides
						? project.branchPrefixCustom
						: globalSettings?.branchPrefixCustom;

					const rawPrefix = await getBranchPrefix({
						repoPath: project.mainRepoPath,
						mode: prefixMode,
						customPrefix,
					});
					const sanitizedPrefix = rawPrefix
						? sanitizeAuthorPrefix(rawPrefix)
						: undefined;

					const existingSet = new Set(
						existingBranches.map((b) => b.toLowerCase()),
					);
					const prefixWouldCollide =
						sanitizedPrefix && existingSet.has(sanitizedPrefix.toLowerCase());
					branchPrefix = prefixWouldCollide ? undefined : sanitizedPrefix;
				} catch (error) {
					console.warn(
						"[generateBranchName] Failed to get branch prefix:",
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
