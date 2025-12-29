import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative } from "node:path";
import type { FileContents } from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { detectLanguage } from "./utils/parse-status";

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
			reason: "not-found" | "too-large" | "binary" | "outside-worktree";
	  };

/**
 * Validates that a file path is within the worktree and doesn't escape via symlinks.
 * Requires the file to exist (uses realpath).
 */
async function validatePathInWorktree(
	worktreePath: string,
	filePath: string,
): Promise<{ valid: boolean; resolvedPath?: string; reason?: string }> {
	// Reject absolute paths
	if (isAbsolute(filePath)) {
		return { valid: false, reason: "outside-worktree" };
	}

	// Normalize and check for traversal
	const normalizedPath = normalize(filePath);
	if (normalizedPath.startsWith("..") || normalizedPath.includes("/../")) {
		return { valid: false, reason: "outside-worktree" };
	}

	const fullPath = join(worktreePath, normalizedPath);

	// Resolve symlinks and verify the real path is still within worktree
	try {
		const realWorktreePath = await realpath(worktreePath);
		const realFilePath = await realpath(fullPath);
		const relativePath = relative(realWorktreePath, realFilePath);

		// If relative path starts with "..", the file is outside worktree
		if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
			return { valid: false, reason: "outside-worktree" };
		}

		return { valid: true, resolvedPath: realFilePath };
	} catch {
		// File doesn't exist
		return { valid: false, reason: "not-found" };
	}
}

/**
 * Validates that a file path is safe for writing within the worktree.
 * Does not require the file to exist (validates path structure and parent directory).
 */
async function validatePathForWrite(
	worktreePath: string,
	filePath: string,
): Promise<{ valid: boolean; resolvedPath?: string; reason?: string }> {
	// Reject absolute paths
	if (isAbsolute(filePath)) {
		return { valid: false, reason: "outside-worktree" };
	}

	// Normalize and check for traversal
	const normalizedPath = normalize(filePath);
	if (normalizedPath.startsWith("..") || normalizedPath.includes("/../")) {
		return { valid: false, reason: "outside-worktree" };
	}

	const fullPath = join(worktreePath, normalizedPath);

	// Resolve the worktree path and verify our target path is within it
	try {
		const realWorktreePath = await realpath(worktreePath);

		// For writes, we can't realpath the file (it may not exist), but we can check
		// the normalized path structure is within the worktree
		const candidatePath = join(realWorktreePath, normalizedPath);
		const relativePath = relative(realWorktreePath, candidatePath);

		// If relative path starts with "..", the file is outside worktree
		if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
			return { valid: false, reason: "outside-worktree" };
		}

		return { valid: true, resolvedPath: candidatePath };
	} catch {
		// Worktree path doesn't exist or isn't accessible
		return { valid: false, reason: "not-found" };
	}
}

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
				}),
			)
			.query(async ({ input }): Promise<FileContents> => {
				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";
				const originalPath = input.oldPath || input.filePath;

				const { original, modified } = await getFileVersions(
					git,
					input.worktreePath,
					input.filePath,
					originalPath,
					input.category,
					defaultBranch,
					input.commitHash,
				);

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
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				// Validate path is within worktree (prevents path traversal attacks)
				const validation = await validatePathForWrite(
					input.worktreePath,
					input.filePath,
				);

				if (!validation.valid || !validation.resolvedPath) {
					throw new Error(
						validation.reason === "outside-worktree"
							? "Cannot write to files outside worktree"
							: "File path validation failed",
					);
				}

				await writeFile(validation.resolvedPath, input.content, "utf-8");
				return { success: true };
			}),

		/**
		 * Read a working tree file safely with size cap and binary detection.
		 * Used for File Viewer raw/rendered modes.
		 * Follows DL-005 (path validation) and DL-008 (size/binary policy).
		 */
		readWorkingFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileResult> => {
				// Validate path is within worktree
				const validation = await validatePathInWorktree(
					input.worktreePath,
					input.filePath,
				);

				if (!validation.valid || !validation.resolvedPath) {
					return {
						ok: false,
						reason: (validation.reason ?? "not-found") as
							| "not-found"
							| "outside-worktree",
					};
				}

				const resolvedPath = validation.resolvedPath;

				// Check file size
				try {
					const stats = await lstat(resolvedPath);
					if (stats.size > MAX_FILE_SIZE) {
						return { ok: false, reason: "too-large" };
					}
				} catch {
					return { ok: false, reason: "not-found" };
				}

				// Read file content
				let buffer: Buffer;
				try {
					buffer = await readFile(resolvedPath);
				} catch {
					return { ok: false, reason: "not-found" };
				}

				// Check for binary content
				if (isBinaryContent(buffer)) {
					return { ok: false, reason: "binary" };
				}

				// Return content as string
				return {
					ok: true,
					content: buffer.toString("utf-8"),
					truncated: false,
					byteLength: buffer.length,
				};
			}),
	});
};

type DiffCategory = "against-base" | "committed" | "staged" | "unstaged";

interface FileVersions {
	original: string;
	modified: string;
}

async function getFileVersions(
	git: ReturnType<typeof simpleGit>,
	worktreePath: string,
	filePath: string,
	originalPath: string,
	category: DiffCategory,
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

		case "unstaged":
			return getUnstagedVersions(git, worktreePath, filePath, originalPath);
	}
}

async function getAgainstBaseVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
	defaultBranch: string,
): Promise<FileVersions> {
	let original = "";
	let modified = "";

	try {
		original = await git.show([`origin/${defaultBranch}:${originalPath}`]);
	} catch {
		original = "";
	}

	try {
		modified = await git.show([`HEAD:${filePath}`]);
	} catch {
		modified = "";
	}

	return { original, modified };
}

async function getCommittedVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
	commitHash: string,
): Promise<FileVersions> {
	let original = "";
	let modified = "";

	try {
		original = await git.show([`${commitHash}^:${originalPath}`]);
	} catch {
		original = "";
	}

	try {
		modified = await git.show([`${commitHash}:${filePath}`]);
	} catch {
		modified = "";
	}

	return { original, modified };
}

async function getStagedVersions(
	git: ReturnType<typeof simpleGit>,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	let original = "";
	let modified = "";

	try {
		original = await git.show([`HEAD:${originalPath}`]);
	} catch {
		original = "";
	}

	try {
		modified = await git.show([`:0:${filePath}`]);
	} catch {
		modified = "";
	}

	return { original, modified };
}

async function getUnstagedVersions(
	git: ReturnType<typeof simpleGit>,
	worktreePath: string,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	let original = "";
	let modified = "";

	try {
		original = await git.show([`:0:${originalPath}`]);
	} catch {
		try {
			original = await git.show([`HEAD:${originalPath}`]);
		} catch {
			original = "";
		}
	}

	try {
		modified = await readFile(join(worktreePath, filePath), "utf-8");
	} catch {
		modified = "";
	}

	return { original, modified };
}
