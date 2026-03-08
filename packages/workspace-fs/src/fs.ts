import fs from "node:fs/promises";
import path from "node:path";
import {
	isPathWithinRoot,
	normalizeAbsolutePath,
	toRelativePath,
} from "./paths";
import type { WorkspaceFsEntry } from "./types";

interface DeletePathError {
	absolutePath: string;
	error: string;
}

export interface DeletePathsResult {
	deleted: string[];
	errors: DeletePathError[];
}

export interface MoveCopyResult {
	entries: { from: string; to: string }[];
	errors: DeletePathError[];
}

export interface WorkspaceFsStat {
	size: number;
	isDirectory: boolean;
	isFile: boolean;
	isSymbolicLink: boolean;
	createdAt: string;
	modifiedAt: string;
	accessedAt: string;
}

interface EnsureWithinRootOptions {
	rootPath: string;
	absolutePath: string;
}

function ensureWithinRoot({
	rootPath,
	absolutePath,
}: EnsureWithinRootOptions): string {
	const normalizedRootPath = normalizeAbsolutePath(rootPath);
	const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);

	if (!isPathWithinRoot(normalizedRootPath, normalizedAbsolutePath)) {
		throw new Error(
			`Path is outside workspace root: ${normalizedAbsolutePath}`,
		);
	}

	return normalizedAbsolutePath;
}

function toEntry(
	rootPath: string,
	absolutePath: string,
	isDirectory: boolean,
): WorkspaceFsEntry {
	const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);
	return {
		id: normalizedAbsolutePath,
		name: path.basename(normalizedAbsolutePath),
		absolutePath: normalizedAbsolutePath,
		relativePath: toRelativePath(rootPath, normalizedAbsolutePath),
		isDirectory,
	};
}

export async function listDirectory({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<WorkspaceFsEntry[]> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	const entries = await fs.readdir(targetPath, { withFileTypes: true });

	return entries
		.map((entry) => {
			const entryAbsolutePath = path.join(targetPath, entry.name);
			return toEntry(rootPath, entryAbsolutePath, entry.isDirectory());
		})
		.sort((left, right) => {
			if (left.isDirectory !== right.isDirectory) {
				return left.isDirectory ? -1 : 1;
			}
			return left.name.localeCompare(right.name);
		});
}

export async function createFileAtPath({
	rootPath,
	absolutePath,
	content = "",
}: {
	rootPath: string;
	absolutePath: string;
	content?: string;
}): Promise<{ absolutePath: string }> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await fs.writeFile(targetPath, content, { encoding: "utf8", flag: "wx" });
	return { absolutePath: targetPath };
}

export async function createDirectoryAtPath({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<{ absolutePath: string }> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await fs.mkdir(targetPath);
	return { absolutePath: targetPath };
}

export async function renamePath({
	rootPath,
	absolutePath,
	newName,
}: {
	rootPath: string;
	absolutePath: string;
	newName: string;
}): Promise<{ oldAbsolutePath: string; newAbsolutePath: string }> {
	const sourcePath = ensureWithinRoot({ rootPath, absolutePath });
	const destinationPath = ensureWithinRoot({
		rootPath,
		absolutePath: path.join(path.dirname(sourcePath), newName),
	});

	await fs.access(destinationPath).then(
		() => {
			throw new Error(`Target already exists: ${newName}`);
		},
		(error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") {
				throw error;
			}
		},
	);

	await fs.rename(sourcePath, destinationPath);
	return { oldAbsolutePath: sourcePath, newAbsolutePath: destinationPath };
}

export async function deletePaths({
	rootPath,
	absolutePaths,
	permanent = false,
	trashItem,
}: {
	rootPath: string;
	absolutePaths: string[];
	permanent?: boolean;
	trashItem?: (absolutePath: string) => Promise<void>;
}): Promise<DeletePathsResult> {
	const deleted: string[] = [];
	const errors: DeletePathError[] = [];

	for (const absolutePath of absolutePaths) {
		try {
			const targetPath = ensureWithinRoot({ rootPath, absolutePath });
			if (permanent) {
				await fs.rm(targetPath, { recursive: true, force: true });
			} else if (trashItem) {
				await trashItem(targetPath);
			} else {
				await fs.rm(targetPath, { recursive: true, force: true });
			}
			deleted.push(targetPath);
		} catch (error) {
			errors.push({
				absolutePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { deleted, errors };
}

export async function movePaths({
	rootPath,
	absolutePaths,
	destinationAbsolutePath,
}: {
	rootPath: string;
	absolutePaths: string[];
	destinationAbsolutePath: string;
}): Promise<MoveCopyResult> {
	const destinationPath = ensureWithinRoot({
		rootPath,
		absolutePath: destinationAbsolutePath,
	});
	const entries: { from: string; to: string }[] = [];
	const errors: DeletePathError[] = [];

	for (const absolutePath of absolutePaths) {
		try {
			const sourcePath = ensureWithinRoot({ rootPath, absolutePath });
			const targetPath = path.join(destinationPath, path.basename(sourcePath));

			await fs.access(targetPath).then(
				() => {
					throw new Error(
						`Target already exists: ${path.basename(sourcePath)}`,
					);
				},
				(error: NodeJS.ErrnoException) => {
					if (error.code !== "ENOENT") {
						throw error;
					}
				},
			);

			await fs.rename(sourcePath, targetPath);
			entries.push({ from: sourcePath, to: targetPath });
		} catch (error) {
			errors.push({
				absolutePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { entries, errors };
}

export async function copyPaths({
	rootPath,
	absolutePaths,
	destinationAbsolutePath,
}: {
	rootPath: string;
	absolutePaths: string[];
	destinationAbsolutePath: string;
}): Promise<MoveCopyResult> {
	const destinationPath = ensureWithinRoot({
		rootPath,
		absolutePath: destinationAbsolutePath,
	});
	const entries: { from: string; to: string }[] = [];
	const errors: DeletePathError[] = [];

	for (const absolutePath of absolutePaths) {
		try {
			const sourcePath = ensureWithinRoot({ rootPath, absolutePath });
			const fileName = path.basename(sourcePath);
			let targetPath = path.join(destinationPath, fileName);

			let counter = 1;
			while (true) {
				try {
					await fs.access(targetPath);
					const extension = path.extname(fileName);
					const basename = path.basename(fileName, extension);
					targetPath = path.join(
						destinationPath,
						`${basename} (${counter})${extension}`,
					);
					counter += 1;
				} catch {
					break;
				}
			}

			await fs.cp(sourcePath, targetPath, { recursive: true });
			entries.push({ from: sourcePath, to: targetPath });
		} catch (error) {
			errors.push({
				absolutePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { entries, errors };
}

export async function pathExists({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<{ exists: boolean; isDirectory: boolean; isFile: boolean }> {
	try {
		const targetPath = ensureWithinRoot({ rootPath, absolutePath });
		const stats = await fs.stat(targetPath);
		return {
			exists: true,
			isDirectory: stats.isDirectory(),
			isFile: stats.isFile(),
		};
	} catch {
		return {
			exists: false,
			isDirectory: false,
			isFile: false,
		};
	}
}

export async function statPath({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<WorkspaceFsStat | null> {
	try {
		const targetPath = ensureWithinRoot({ rootPath, absolutePath });
		const stats = await fs.stat(targetPath);
		return {
			size: stats.size,
			isDirectory: stats.isDirectory(),
			isFile: stats.isFile(),
			isSymbolicLink: stats.isSymbolicLink(),
			createdAt: stats.birthtime.toISOString(),
			modifiedAt: stats.mtime.toISOString(),
			accessedAt: stats.atime.toISOString(),
		};
	} catch {
		return null;
	}
}
