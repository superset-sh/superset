import type { FileContents } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { getImageMimeType } from "shared/file-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	assertRegisteredWorkspacePath,
	PathValidationError,
	secureFs,
} from "./security";
import type { GitRunner } from "./utils/git-runner";
import { resolveGitTarget } from "./utils/git-runner";

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
			reason:
				| "not-found"
				| "too-large"
				| "binary"
				| "outside-worktree"
				| "symlink-escape";
	  };

type ReadWorkingFileImageResult =
	| { ok: true; dataUrl: string; byteLength: number }
	| {
			ok: false;
			reason:
				| "not-found"
				| "too-large"
				| "not-image"
				| "outside-worktree"
				| "symlink-escape";
	  };

function isBinaryContent(buffer: Buffer): boolean {
	const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
			return true;
		}
	}
	return false;
}

function isBinaryString(content: string): boolean {
	const checkLength = Math.min(content.length, BINARY_CHECK_SIZE);
	return content.slice(0, checkLength).includes("\0");
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
					workspaceId: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<FileContents> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const target = resolveGitTarget(input.worktreePath, input.workspaceId);
				const { runner } = target;
				const defaultBranch = input.defaultBranch || "main";
				const originalPath = input.oldPath || input.filePath;

				const { original, modified } = await getFileVersions(
					runner,
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
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const target = resolveGitTarget(input.worktreePath, input.workspaceId);

				if (target.kind === "remote") {
					const escapedPath = input.filePath.replace(/'/g, "'\\''");
					// Use heredoc-style write to handle content with special chars
					const result = await target.runner.exec(
						`cat > '${escapedPath}' << 'SUPERSET_EOF'\n${input.content}\nSUPERSET_EOF`,
					);
					if (result.code !== 0) {
						throw new Error(result.stderr || "Failed to write file on remote");
					}
					return { success: true };
				}

				await secureFs.writeFile(
					input.worktreePath,
					input.filePath,
					input.content,
				);
				return { success: true };
			}),

		readWorkingFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileResult> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const target = resolveGitTarget(input.worktreePath, input.workspaceId);

				if (target.kind === "remote") {
					return readWorkingFileRemote(target.runner, input.filePath);
				}

				return readWorkingFileLocal(input.worktreePath, input.filePath);
			}),

		readWorkingFileImage: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<ReadWorkingFileImageResult> => {
				const mimeType = getImageMimeType(input.filePath);
				if (!mimeType) {
					return { ok: false, reason: "not-image" };
				}

				assertRegisteredWorkspacePath(input.worktreePath);

				const target = resolveGitTarget(input.worktreePath, input.workspaceId);

				if (target.kind === "remote") {
					return readWorkingFileImageRemote(
						target.runner,
						input.filePath,
						mimeType,
					);
				}

				return readWorkingFileImageLocal(
					input.worktreePath,
					input.filePath,
					mimeType,
				);
			}),
	});
};

// =============================================================================
// File Version Resolution (for diffs)
// =============================================================================

type DiffCategory = "against-base" | "committed" | "staged" | "unstaged";

interface FileVersions {
	original: string;
	modified: string;
}

async function getFileVersions(
	runner: GitRunner,
	worktreePath: string,
	filePath: string,
	originalPath: string,
	category: DiffCategory,
	defaultBranch: string,
	commitHash?: string,
): Promise<FileVersions> {
	switch (category) {
		case "against-base":
			return getAgainstBaseVersions(
				runner,
				filePath,
				originalPath,
				defaultBranch,
			);

		case "committed":
			if (!commitHash) {
				throw new Error("commitHash required for committed category");
			}
			return getCommittedVersions(runner, filePath, originalPath, commitHash);

		case "staged":
			return getStagedVersions(runner, filePath, originalPath);

		case "unstaged":
			return getUnstagedVersions(runner, worktreePath, filePath, originalPath);
	}
}

async function safeGitShow(runner: GitRunner, spec: string): Promise<string> {
	try {
		const sizeResult = await runner.rawSafe(["cat-file", "-s", spec]);
		if (sizeResult.code === 0) {
			const blobSize = Number.parseInt(sizeResult.stdout.trim(), 10);
			if (!Number.isNaN(blobSize) && blobSize > MAX_FILE_SIZE) {
				return `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		}

		return await runner.raw(["show", spec]);
	} catch {
		return "";
	}
}

async function getAgainstBaseVersions(
	runner: GitRunner,
	filePath: string,
	originalPath: string,
	defaultBranch: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(runner, `origin/${defaultBranch}:${originalPath}`),
		safeGitShow(runner, `HEAD:${filePath}`),
	]);
	return { original, modified };
}

async function getCommittedVersions(
	runner: GitRunner,
	filePath: string,
	originalPath: string,
	commitHash: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(runner, `${commitHash}^:${originalPath}`),
		safeGitShow(runner, `${commitHash}:${filePath}`),
	]);
	return { original, modified };
}

async function getStagedVersions(
	runner: GitRunner,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	const [original, modified] = await Promise.all([
		safeGitShow(runner, `HEAD:${originalPath}`),
		safeGitShow(runner, `:0:${filePath}`),
	]);
	return { original, modified };
}

async function getUnstagedVersions(
	runner: GitRunner,
	worktreePath: string,
	filePath: string,
	originalPath: string,
): Promise<FileVersions> {
	// Try staged version first, fall back to HEAD
	let original = await safeGitShow(runner, `:0:${originalPath}`);
	if (!original) {
		original = await safeGitShow(runner, `HEAD:${originalPath}`);
	}

	let modified = "";

	if (runner.isRemote) {
		try {
			const escapedPath = filePath.replace(/'/g, "'\\''");
			const statResult = await runner.exec(`stat -c '%s' '${escapedPath}'`);
			if (statResult.code === 0) {
				const size = Number.parseInt(statResult.stdout.trim(), 10);
				if (size > MAX_FILE_SIZE) {
					modified = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
					return { original, modified };
				}
			}

			const catResult = await runner.exec(`cat '${escapedPath}'`);
			if (catResult.code === 0) {
				modified = catResult.stdout;
			}
		} catch {
			modified = "";
		}
	} else {
		try {
			const stats = await secureFs.stat(worktreePath, filePath);
			if (stats.size <= MAX_FILE_SIZE) {
				modified = await secureFs.readFile(worktreePath, filePath);
			} else {
				modified = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		} catch {
			modified = "";
		}
	}

	return { original, modified };
}

// =============================================================================
// Working File Readers
// =============================================================================

async function readWorkingFileRemote(
	runner: GitRunner,
	filePath: string,
): Promise<ReadWorkingFileResult> {
	try {
		const escapedPath = filePath.replace(/'/g, "'\\''");

		// Check size
		const statResult = await runner.exec(`stat -c '%s' '${escapedPath}'`);
		if (statResult.code !== 0) {
			return { ok: false, reason: "not-found" };
		}
		const size = Number.parseInt(statResult.stdout.trim(), 10);
		if (size > MAX_FILE_SIZE) {
			return { ok: false, reason: "too-large" };
		}

		// Binary check (first 8KB)
		const headResult = await runner.exec(
			`head -c ${BINARY_CHECK_SIZE} '${escapedPath}'`,
		);
		if (headResult.code === 0 && isBinaryString(headResult.stdout)) {
			return { ok: false, reason: "binary" };
		}

		// Read full file
		const catResult = await runner.exec(`cat '${escapedPath}'`);
		if (catResult.code !== 0) {
			return { ok: false, reason: "not-found" };
		}

		return {
			ok: true,
			content: catResult.stdout,
			truncated: false,
			byteLength: Buffer.byteLength(catResult.stdout, "utf-8"),
		};
	} catch {
		return { ok: false, reason: "not-found" };
	}
}

async function readWorkingFileLocal(
	worktreePath: string,
	filePath: string,
): Promise<ReadWorkingFileResult> {
	try {
		const stats = await secureFs.stat(worktreePath, filePath);
		if (stats.size > MAX_FILE_SIZE) {
			return { ok: false, reason: "too-large" };
		}

		const buffer = await secureFs.readFileBuffer(worktreePath, filePath);

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
}

async function readWorkingFileImageRemote(
	runner: GitRunner,
	filePath: string,
	mimeType: string,
): Promise<ReadWorkingFileImageResult> {
	try {
		const escapedPath = filePath.replace(/'/g, "'\\''");

		const statResult = await runner.exec(`stat -c '%s' '${escapedPath}'`);
		if (statResult.code !== 0) {
			return { ok: false, reason: "not-found" };
		}
		const size = Number.parseInt(statResult.stdout.trim(), 10);
		if (size > MAX_IMAGE_SIZE) {
			return { ok: false, reason: "too-large" };
		}

		const result = await runner.exec(`base64 '${escapedPath}'`);
		if (result.code !== 0) {
			return { ok: false, reason: "not-found" };
		}

		const base64 = result.stdout.replace(/\s/g, "");
		const dataUrl = `data:${mimeType};base64,${base64}`;

		return {
			ok: true,
			dataUrl,
			byteLength: size,
		};
	} catch {
		return { ok: false, reason: "not-found" };
	}
}

async function readWorkingFileImageLocal(
	worktreePath: string,
	filePath: string,
	mimeType: string,
): Promise<ReadWorkingFileImageResult> {
	try {
		const stats = await secureFs.stat(worktreePath, filePath);
		if (stats.size > MAX_IMAGE_SIZE) {
			return { ok: false, reason: "too-large" };
		}

		const buffer = await secureFs.readFileBuffer(worktreePath, filePath);
		const base64 = buffer.toString("base64");
		const dataUrl = `data:${mimeType};base64,${base64}`;

		return {
			ok: true,
			dataUrl,
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
}
