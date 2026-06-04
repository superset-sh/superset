import type { FileContents } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import type { SimpleGit } from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { toRegisteredWorktreeRelativePath } from "../workspace-fs-service";
import { getSimpleGitWithShellPath } from "../workspaces/utils/git-client";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

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
				const git = await getSimpleGitWithShellPath(input.worktreePath);
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

				const versions = await getGitOnlyVersions(
					git,
					filePath,
					originalPath,
					input.category,
					defaultBranch,
					input.commitHash,
				);

				return {
					original: versions.original,
					modified: versions.modified,
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
				const git = await getSimpleGitWithShellPath(input.worktreePath);
				const originalPath = input.oldAbsolutePath
					? toRegisteredWorktreeRelativePath(
							input.worktreePath,
							input.oldAbsolutePath,
						)
					: toRegisteredWorktreeRelativePath(
							input.worktreePath,
							input.absolutePath,
						);

				const staged = await safeGitShow(git, `:0:${originalPath}`);
				const content =
					staged ?? (await safeGitShow(git, `HEAD:${originalPath}`));
				return { content: content ?? "" };
			}),
	});
};

interface FileVersions {
	original: string;
	modified: string;
}

async function getGitOnlyVersions(
	git: SimpleGit,
	filePath: string,
	originalPath: string,
	category: "against-base" | "committed" | "staged",
	defaultBranch: string,
	commitHash?: string,
): Promise<FileVersions> {
	switch (category) {
		case "against-base":
			return getAgainstBaseVersions(git, filePath, originalPath, defaultBranch);

		case "committed":
			if (!commitHash) {
				throw new Error("commitHash required for committed category");
			}
			return getCommittedVersions(git, filePath, originalPath, commitHash);

		case "staged":
			return getStagedVersions(git, filePath, originalPath);
	}
}

async function safeGitShow(
	git: SimpleGit,
	spec: string,
): Promise<string | null> {
	try {
		// Guard against memory spikes from large blobs in git history
		try {
			const sizeOutput = await git.raw(["cat-file", "-s", spec]);
			const blobSize = Number.parseInt(sizeOutput.trim(), 10);
			if (!Number.isNaN(blobSize) && blobSize > MAX_FILE_SIZE) {
				return `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		} catch {}

		const content = await git.show([spec]);
		return content;
	} catch {
		return null;
	}
}

async function getAgainstBaseVersions(
	git: SimpleGit,
	filePath: string,
	originalPath: string,
	defaultBranch: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `origin/${defaultBranch}:${originalPath}`),
		safeGitShow(git, `HEAD:${filePath}`),
	]);

	return { original: original ?? "", modified: modified ?? "" };
}

async function getCommittedVersions(
	git: SimpleGit,
	filePath: string,
	originalPath: string,
	commitHash: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `${commitHash}^:${originalPath}`),
		safeGitShow(git, `${commitHash}:${filePath}`),
	]);

	return { original: original ?? "", modified: modified ?? "" };
}

async function getStagedVersions(
	git: SimpleGit,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `HEAD:${originalPath}`),
		safeGitShow(git, `:0:${filePath}`),
	]);

	return { original: original ?? "", modified: modified ?? "" };
}
