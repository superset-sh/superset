import type { FileContents } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { toRegisteredWorktreeRelativePath } from "../workspace-fs-service";
import { runGitTask } from "./workers/git-task-runner";
import type { GitTaskPayloadMap } from "./workers/git-task-types";

export const createFileContentsRouter = () => {
	return router({
		getGitFileContents: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					absolutePath: z.string(),
					oldAbsolutePath: z.string().optional(),
					category: z.enum(["against-base", "committed", "staged"]),
					commitHash: z.string().optional(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<FileContents> => {
				const defaultBranch = input.defaultBranch || "main";
				const filePath = toRegisteredWorktreeRelativePath(
					input.worktreePath,
					input.absolutePath,
				);
				const originalPath = input.oldAbsolutePath
					? toRegisteredWorktreeRelativePath(
							input.worktreePath,
							input.oldAbsolutePath,
						)
					: filePath;

				const versions = await runGitTask(
					"getFileContents",
					buildFileContentsPayload(input, {
						filePath,
						originalPath,
						defaultBranch,
					}),
					{
						// JSON-encoded: paths may contain the delimiter, and a raw
						// join could coalesce two different files into one task.
						dedupeKey: `getFileContents:${JSON.stringify([
							input.worktreePath,
							input.category,
							filePath,
							originalPath,
							defaultBranch,
							input.commitHash ?? "",
						])}`,
						strategy: "coalesce",
						timeoutMs: 30_000,
					},
				);

				return {
					original: versions.original ?? "",
					modified: versions.modified ?? "",
					language: detectLanguage(input.absolutePath),
				};
			}),

		getGitOriginalContent: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					absolutePath: z.string(),
					oldAbsolutePath: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<{ content: string }> => {
				const originalPath = input.oldAbsolutePath
					? toRegisteredWorktreeRelativePath(
							input.worktreePath,
							input.oldAbsolutePath,
						)
					: toRegisteredWorktreeRelativePath(
							input.worktreePath,
							input.absolutePath,
						);

				const versions = await runGitTask(
					"getFileContents",
					{
						worktreePath: input.worktreePath,
						filePath: originalPath,
						originalPath,
						category: "original",
					},
					{
						dedupeKey: `getFileContents:${JSON.stringify([
							input.worktreePath,
							"original",
							originalPath,
						])}`,
						strategy: "coalesce",
						timeoutMs: 30_000,
					},
				);

				return { content: versions.modified ?? versions.original ?? "" };
			}),
	});
};

function buildFileContentsPayload(
	input: {
		worktreePath: string;
		category: "against-base" | "committed" | "staged";
		commitHash?: string;
	},
	{
		filePath,
		originalPath,
		defaultBranch,
	}: { filePath: string; originalPath: string; defaultBranch: string },
): GitTaskPayloadMap["getFileContents"] {
	const base = { worktreePath: input.worktreePath, filePath, originalPath };
	switch (input.category) {
		case "against-base":
			return { ...base, category: "against-base", defaultBranch };
		case "committed": {
			if (!input.commitHash) {
				throw new Error("commitHash required for committed category");
			}
			return { ...base, category: "committed", commitHash: input.commitHash };
		}
		case "staged":
			return { ...base, category: "staged" };
	}
}
