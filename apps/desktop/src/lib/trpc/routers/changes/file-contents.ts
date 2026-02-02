import type { FileContents } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	assertRegisteredWorktree,
	PathValidationError,
	secureFs,
} from "./security";

/** Maximum file size for reading (2 MiB) */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Bytes to scan for binary detection */
const BINARY_CHECK_SIZE = 8192;

/**
 * Result type for readWorkingFile procedure
 */
type ReadWorkingFileResult =
	| { ok: true; content: string; truncated: boolean; byteLength: number }
	| {
			ok: false;
			reason:
				| "not-found"
				| "too-large"
				| "binary"
				| "outside-worktree"
				| "symlink-escape";
	  };

/**
 * Detects if a buffer contains binary content by checking for NUL bytes
 */
function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
			return true;
		}
	}
	return false;
}

export const createFileContentsRouter = () => {
	return router({
		getFileContents: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					oldPath: z.string().optional(),
					category: z.enum(["against-base", "committed", "staged", "unstaged"]),
					commitHash: z.string().optional(),
					defaultBranch: z.string().optional(),
					repoPath: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<FileContents> => {
				assertRegisteredWorktree(input.worktreePath);

				const targetPath = input.repoPath || input.worktreePath;
				const git = simpleGit(targetPath);
				const defaultBranch = input.defaultBranch || "main";
				const originalPath = input.oldPath || input.filePath;

				const { original, modified } = await getFileVersions({
					git,
					worktreePath: input.worktreePath,
					targetRepoPath: targetPath,
					filePath: input.filePath,
					originalPath,
					category: input.category,
					defaultBranch,
					commitHash: input.commitHash,
				});

				return {
					original,
					modified,
					language: detectLanguage(input.filePath),
				};
			}),

		saveFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					content: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const targetPath = input.repoPath || input.worktreePath;
				// Use nested-repo-aware write that validates both worktree and nested repo
				await secureFs.writeFileInNestedRepo(
					input.worktreePath,
					targetPath,
					input.filePath,
					input.content,
				);
				return { success: true };
			}),

		/**
		 * Read a working tree file safely with size cap and binary detection.
		 * Used for File Viewer raw/rendered modes.
		 */
		readWorkingFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileResult> => {
				try {
					const targetPath = input.repoPath || input.worktreePath;
					// Use nested-repo-aware methods that validate both worktree and nested repo
					const stats = await secureFs.statInNestedRepo(
						input.worktreePath,
						targetPath,
						input.filePath,
					);
					if (stats.size > MAX_FILE_SIZE) {
						return { ok: false, reason: "too-large" };
					}

					const buffer = await secureFs.readFileBufferInNestedRepo(
						input.worktreePath,
						targetPath,
						input.filePath,
					);

					if (isBinaryContent(buffer)) {
						return { ok: false, reason: "binary" };
					}

					return {
						ok: true,
						content: buffer.toString("utf-8"),
						truncated: false,
						byteLength: buffer.length,
					};
				} catch (error) {
					if (error instanceof PathValidationError) {
						if (error.code === "SYMLINK_ESCAPE") {
							return { ok: false, reason: "symlink-escape" };
						}
						return { ok: false, reason: "outside-worktree" };
					}
					return { ok: false, reason: "not-found" };
				}
			}),
	});
};

type DiffCategory = "against-base" | "committed" | "staged" | "unstaged";

interface FileVersions {
	original: string;
	modified: string;
}

interface GetFileVersionsParams {
	git: ReturnType<typeof simpleGit>;
	/** The registered parent worktree (for security validation) */
	worktreePath: string;
	/** The target repo path (may be nested repo or same as worktreePath) */
	targetRepoPath: string;
	filePath: string;
	originalPath: string;
	category: DiffCategory;
	defaultBranch: string;
	commitHash?: string;
}

async function getFileVersions({
	git,
	worktreePath,
	targetRepoPath,
	filePath,
	originalPath,
	category,
	defaultBranch,
	commitHash,
}: GetFileVersionsParams): Promise<FileVersions> {
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

		case "unstaged":
			return getUnstagedVersions({
				git,
				worktreePath,
				targetRepoPath,
				filePath,
				originalPath,
			});
	}
}

/** Helper to safely get git show content with size limit and memory protection */
async function safeGitShow(
	git: ReturnType<typeof simpleGit>,
	spec: string,
): Promise<string> {
	try {
		// Preflight: check blob size before loading into memory
		// This prevents memory spikes from large files in git history
		try {
			const sizeOutput = await git.raw(["cat-file", "-s", spec]);
			const blobSize = Number.parseInt(sizeOutput.trim(), 10);
			if (!Number.isNaN(blobSize) && blobSize > MAX_FILE_SIZE) {
				return `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		} catch {
			// cat-file failed (blob doesn't exist) - let git.show handle the error
		}

		const content = await git.show([spec]);
		return content;
	} catch {
		return "";
	}
}

async function getAgainstBaseVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
	defaultBranch: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `origin/${defaultBranch}:${originalPath}`),
		safeGitShow(git, `HEAD:${filePath}`),
	]);

	return { original, modified };
}

async function getCommittedVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
	commitHash: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `${commitHash}^:${originalPath}`),
		safeGitShow(git, `${commitHash}:${filePath}`),
	]);

	return { original, modified };
}

async function getStagedVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `HEAD:${originalPath}`),
		safeGitShow(git, `:0:${filePath}`),
	]);

	return { original, modified };
}

interface GetUnstagedVersionsParams {
	git: ReturnType<typeof simpleGit>;
	/** The registered parent worktree (for security validation) */
	worktreePath: string;
	/** The target repo path (may be nested repo or same as worktreePath) */
	targetRepoPath: string;
	filePath: string;
	originalPath: string;
}

async function getUnstagedVersions({
	git,
	worktreePath,
	targetRepoPath,
	filePath,
	originalPath,
}: GetUnstagedVersionsParams): Promise<FileVersions> {
	// Try staged version first, fall back to HEAD
	let original = await safeGitShow(git, `:0:${originalPath}`);
	if (!original) {
		original = await safeGitShow(git, `HEAD:${originalPath}`);
	}

	let modified = "";
	try {
		// Use nested-repo-aware methods for proper security validation
		const stats = await secureFs.statInNestedRepo(
			worktreePath,
			targetRepoPath,
			filePath,
		);
		if (stats.size <= MAX_FILE_SIZE) {
			modified = await secureFs.readFileInNestedRepo(
				worktreePath,
				targetRepoPath,
				filePath,
			);
		} else {
			modified = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
		}
	} catch (error) {
		// Log the error to help debug
		console.error("[getUnstagedVersions] Failed to read file:", {
			worktreePath,
			targetRepoPath,
			filePath,
			error: error instanceof Error ? error.message : error,
		});
		modified = "";
	}

	return { original, modified };
}
