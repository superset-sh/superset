import path from "node:path";
import {
	readFile as fsReadFile,
	writeFile as fsWriteFile,
} from "@superset/workspace-fs/host";
import type { FileContents } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { getImageMimeType } from "shared/file-types";
import type { SimpleGit } from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { toRegisteredWorktreeRelativePath } from "../workspace-fs-service";
import { getSimpleGitWithShellPath } from "../workspaces/utils/git-client";
import { clearStatusCacheForWorktree } from "./utils/status-cache";

/** Maximum file size for reading (2 MiB) */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Maximum image file size (10 MiB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Bytes to scan for binary detection */
const BINARY_CHECK_SIZE = 8192;

type ReadWorkingFileResult =
	| { ok: true; content: string; truncated: boolean; byteLength: number }
	| {
			ok: false;
			reason: "not-found" | "too-large" | "binary" | "is-directory";
	  };

type ReadWorkingFileImageResult =
	| { ok: true; dataUrl: string; byteLength: number }
	| {
			ok: false;
			reason: "not-found" | "too-large" | "not-image" | "is-directory";
	  };

type SaveFileResult =
	| { status: "saved" }
	| { status: "conflict"; currentContent: string | null };

function isEisdir(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "EISDIR";
}

function isBinaryContent(bytes: Uint8Array): boolean {
	const checkLength = Math.min(bytes.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i++) {
		if (bytes[i] === 0) {
			return true;
		}
	}
	return false;
}

export const createFileContentsRouter = () => {
	return router({
		// -----------------------------------------------------------------
		// New pure-git procedures (Milestone 4)
		// -----------------------------------------------------------------

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

				// Try staged version first, fall back to HEAD
				let content = await safeGitShow(git, `:0:${originalPath}`);
				if (!content) {
					content = await safeGitShow(git, `HEAD:${originalPath}`);
				}
				return { content };
			}),

		// -----------------------------------------------------------------
		// Legacy procedures (backward compat — renderer migrates in M7)
		// -----------------------------------------------------------------

		getFileContents: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					absolutePath: z.string(),
					oldAbsolutePath: z.string().optional(),
					category: z.enum(["against-base", "committed", "staged", "unstaged"]),
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

				const { original, modified } = await getFileVersions(
					git,
					input.worktreePath,
					filePath,
					originalPath,
					input.category,
					defaultBranch,
					input.commitHash,
				);

				return {
					original,
					modified,
					language: detectLanguage(input.absolutePath),
				};
			}),

		saveFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					absolutePath: z.string(),
					content: z.string(),
					expectedContent: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<SaveFileResult> => {
				if (input.expectedContent !== undefined) {
					let currentContent: string | null = null;
					try {
						const result = await fsReadFile({
							rootPath: input.worktreePath,
							absolutePath: input.absolutePath,
							encoding: "utf-8",
						});
						currentContent = result.content as string;
					} catch {
						// File doesn't exist yet
					}
					if (
						currentContent !== null &&
						currentContent !== input.expectedContent
					) {
						return { status: "conflict", currentContent };
					}
				}

				await fsWriteFile({
					rootPath: input.worktreePath,
					absolutePath: input.absolutePath,
					content: input.content,
					encoding: "utf-8",
				});
				clearStatusCacheForWorktree(input.worktreePath);
				return { status: "saved" };
			}),

		readWorkingFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileResult> => {
				try {
					const result = await fsReadFile({
						rootPath: input.worktreePath,
						absolutePath: input.absolutePath,
						maxBytes: MAX_FILE_SIZE,
					});

					if (result.exceededLimit) {
						return { ok: false, reason: "too-large" };
					}

					// No encoding → bytes mode
					const bytes = result.content as Uint8Array;
					if (isBinaryContent(bytes)) {
						return { ok: false, reason: "binary" };
					}

					return {
						ok: true,
						content: new TextDecoder("utf-8").decode(bytes),
						truncated: false,
						byteLength: result.byteLength,
					};
				} catch (error) {
					if (isEisdir(error)) {
						return { ok: false, reason: "is-directory" };
					}
					return { ok: false, reason: "not-found" };
				}
			}),

		readWorkingFileImage: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileImageResult> => {
				const mimeType = getImageMimeType(input.absolutePath);
				if (!mimeType) {
					return { ok: false, reason: "not-image" };
				}

				try {
					const result = await fsReadFile({
						rootPath: input.worktreePath,
						absolutePath: input.absolutePath,
						maxBytes: MAX_IMAGE_SIZE,
					});

					if (result.exceededLimit) {
						return { ok: false, reason: "too-large" };
					}

					const bytes = result.content as Uint8Array;
					const base64 = Buffer.from(bytes).toString("base64");
					return {
						ok: true,
						dataUrl: `data:${mimeType};base64,${base64}`,
						byteLength: result.byteLength,
					};
				} catch (error) {
					if (isEisdir(error)) {
						return { ok: false, reason: "is-directory" };
					}
					return { ok: false, reason: "not-found" };
				}
			}),
	});
};

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

type DiffCategory = "against-base" | "committed" | "staged" | "unstaged";

interface FileVersions {
	original: string;
	modified: string;
}

async function getFileVersions(
	git: SimpleGit,
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

/** Helper to safely get git show content with size limit and memory protection */
async function safeGitShow(git: SimpleGit, spec: string): Promise<string> {
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
	git: SimpleGit,
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
	git: SimpleGit,
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
	git: SimpleGit,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(git, `HEAD:${originalPath}`),
		safeGitShow(git, `:0:${filePath}`),
	]);

	return { original, modified };
}

async function getUnstagedVersions(
	git: SimpleGit,
	worktreePath: string,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	// Try staged version first, fall back to HEAD
	let original = await safeGitShow(git, `:0:${originalPath}`);
	if (!original) {
		original = await safeGitShow(git, `HEAD:${originalPath}`);
	}

	let modified = "";
	try {
		const absolutePath = path.resolve(worktreePath, filePath);
		const result = await fsReadFile({
			rootPath: worktreePath,
			absolutePath,
			maxBytes: MAX_FILE_SIZE,
			encoding: "utf-8",
		});

		if (result.exceededLimit) {
			modified = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
		} else {
			modified = result.content as string;
		}
	} catch {
		modified = "";
	}

	return { original, modified };
}
