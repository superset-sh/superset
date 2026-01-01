import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileContents } from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { detectLanguage } from "./utils/parse-status";

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
				const fullPath = join(input.worktreePath, input.filePath);
				await writeFile(fullPath, input.content, "utf-8");
				return { success: true };
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
