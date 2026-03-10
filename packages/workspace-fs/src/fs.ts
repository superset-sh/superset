import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
	isPathWithinRoot,
	normalizeAbsolutePath,
	toRelativePath,
} from "./paths";
import type {
	DeletePathsResult,
	MoveCopyResult,
	WorkspaceFsEntry,
	WorkspaceFsPathOperationError,
	WorkspaceFsStat,
} from "./types";

export type WorkspaceFsPathErrorCode =
	| "OUTSIDE_ROOT"
	| "INVALID_TARGET"
	| "SYMLINK_ESCAPE";

export class WorkspaceFsPathError extends Error {
	constructor(
		message: string,
		public readonly code: WorkspaceFsPathErrorCode,
	) {
		super(message);
		this.name = "WorkspaceFsPathError";
	}
}

const MAX_COPY_NAME_ATTEMPTS = 1000;

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

async function assertParentWithinRoot(
	rootPath: string,
	absolutePath: string,
): Promise<void> {
	const normalizedRootPath = ensureWithinRoot({
		rootPath,
		absolutePath: rootPath,
	});
	let currentPath = path.dirname(absolutePath);

	while (currentPath !== path.dirname(currentPath)) {
		try {
			const stats = await fs.lstat(currentPath);

			if (stats.isSymbolicLink()) {
				const linkTarget = await fs.readlink(currentPath);
				const resolvedTarget = path.isAbsolute(linkTarget)
					? linkTarget
					: path.resolve(path.dirname(currentPath), linkTarget);

				try {
					const targetRealPath = normalizeAbsolutePath(
						await fs.realpath(resolvedTarget),
					);
					if (!isPathWithinRoot(normalizedRootPath, targetRealPath)) {
						throw new WorkspaceFsPathError(
							"Symlink in path resolves outside workspace root",
							"SYMLINK_ESCAPE",
						);
					}
				} catch (error) {
					if (
						error instanceof Error &&
						"code" in error &&
						error.code === "ENOENT"
					) {
						if (
							!isPathWithinRoot(
								normalizedRootPath,
								normalizeAbsolutePath(resolvedTarget),
							)
						) {
							throw new WorkspaceFsPathError(
								"Dangling symlink points outside workspace root",
								"SYMLINK_ESCAPE",
							);
						}
						return;
					}
					if (error instanceof WorkspaceFsPathError) {
						throw error;
					}
					throw new WorkspaceFsPathError(
						"Cannot validate symlink target",
						"SYMLINK_ESCAPE",
					);
				}

				return;
			}

			const parentRealPath = normalizeAbsolutePath(
				await fs.realpath(currentPath),
			);
			if (!isPathWithinRoot(normalizedRootPath, parentRealPath)) {
				throw new WorkspaceFsPathError(
					"Parent directory resolves outside workspace root",
					"SYMLINK_ESCAPE",
				);
			}

			return;
		} catch (error) {
			if (error instanceof WorkspaceFsPathError) {
				throw error;
			}
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				currentPath = path.dirname(currentPath);
				continue;
			}
			throw new WorkspaceFsPathError(
				"Cannot validate path ancestry",
				"SYMLINK_ESCAPE",
			);
		}
	}

	throw new WorkspaceFsPathError(
		"Could not validate path ancestry within workspace root",
		"SYMLINK_ESCAPE",
	);
}

async function assertDanglingSymlinkSafe(
	rootPath: string,
	absolutePath: string,
): Promise<void> {
	const normalizedRootPath = ensureWithinRoot({
		rootPath,
		absolutePath: rootPath,
	});

	try {
		const stats = await fs.lstat(absolutePath);
		if (stats.isSymbolicLink()) {
			const linkTarget = await fs.readlink(absolutePath);
			const resolvedTarget = path.isAbsolute(linkTarget)
				? linkTarget
				: path.resolve(path.dirname(absolutePath), linkTarget);

			if (
				!isPathWithinRoot(
					normalizedRootPath,
					normalizeAbsolutePath(resolvedTarget),
				)
			) {
				throw new WorkspaceFsPathError(
					"Dangling symlink points outside workspace root",
					"SYMLINK_ESCAPE",
				);
			}

			return;
		}

		await assertParentWithinRoot(rootPath, absolutePath);
	} catch (error) {
		if (error instanceof WorkspaceFsPathError) {
			throw error;
		}
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			await assertParentWithinRoot(rootPath, absolutePath);
			return;
		}
		throw new WorkspaceFsPathError("Cannot validate path", "SYMLINK_ESCAPE");
	}
}

async function assertRealpathWithinRoot(
	rootPath: string,
	absolutePath: string,
): Promise<void> {
	const normalizedRootPath = ensureWithinRoot({
		rootPath,
		absolutePath: rootPath,
	});

	try {
		const realPath = normalizeAbsolutePath(await fs.realpath(absolutePath));
		if (!isPathWithinRoot(normalizedRootPath, realPath)) {
			throw new WorkspaceFsPathError(
				"Path resolves outside workspace root",
				"SYMLINK_ESCAPE",
			);
		}
	} catch (error) {
		if (error instanceof WorkspaceFsPathError) {
			throw error;
		}
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			await assertDanglingSymlinkSafe(rootPath, absolutePath);
			return;
		}
		throw new WorkspaceFsPathError(
			"Cannot validate file path",
			"SYMLINK_ESCAPE",
		);
	}
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

export async function readTextFile({
	rootPath,
	absolutePath,
	encoding = "utf-8",
}: {
	rootPath: string;
	absolutePath: string;
	encoding?: BufferEncoding;
}): Promise<string> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await assertRealpathWithinRoot(rootPath, targetPath);
	return fs.readFile(targetPath, encoding);
}

export async function readFileBuffer({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<Buffer> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await assertRealpathWithinRoot(rootPath, targetPath);
	return fs.readFile(targetPath);
}

export async function writeTextFile({
	rootPath,
	absolutePath,
	content,
}: {
	rootPath: string;
	absolutePath: string;
	content: string;
}): Promise<void> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await assertRealpathWithinRoot(rootPath, targetPath);
	await fs.writeFile(targetPath, content, "utf-8");
}

export async function deletePath({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<void> {
	if (normalizeAbsolutePath(absolutePath) === normalizeAbsolutePath(rootPath)) {
		throw new WorkspaceFsPathError(
			"Cannot target workspace root",
			"INVALID_TARGET",
		);
	}

	const targetPath = ensureWithinRoot({ rootPath, absolutePath });

	let stats: Stats;
	try {
		stats = await fs.lstat(targetPath);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}

	if (stats.isSymbolicLink()) {
		await fs.rm(targetPath);
		return;
	}

	await assertRealpathWithinRoot(rootPath, targetPath);
	await fs.rm(targetPath, { recursive: true, force: true });
}

export async function statFile({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<Stats> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await assertRealpathWithinRoot(rootPath, targetPath);
	return fs.stat(targetPath);
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
	const errors: WorkspaceFsPathOperationError[] = [];

	for (const absolutePath of absolutePaths) {
		try {
			if (!permanent && trashItem) {
				const targetPath = ensureWithinRoot({ rootPath, absolutePath });
				await trashItem(targetPath);
			} else {
				// Permanent delete, or no trash implementation is available.
				await deletePath({ rootPath, absolutePath });
			}
			deleted.push(ensureWithinRoot({ rootPath, absolutePath }));
		} catch (error) {
			errors.push({
				absolutePath,
				error: error instanceof Error ? error.message : String(error),
			} satisfies WorkspaceFsPathOperationError);
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
	const errors: WorkspaceFsPathOperationError[] = [];

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
			} satisfies WorkspaceFsPathOperationError);
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
	const errors: WorkspaceFsPathOperationError[] = [];

	for (const absolutePath of absolutePaths) {
		try {
			const sourcePath = ensureWithinRoot({ rootPath, absolutePath });
			const fileName = path.basename(sourcePath);
			let targetPath = path.join(destinationPath, fileName);

			let counter = 1;
			while (true) {
				if (counter > MAX_COPY_NAME_ATTEMPTS) {
					throw new Error(
						`Failed to find unique copy target for ${fileName} after ${MAX_COPY_NAME_ATTEMPTS} attempts`,
					);
				}

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
			} satisfies WorkspaceFsPathOperationError);
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
		const stats = await statFile({ rootPath, absolutePath });
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
		const stats = await statFile({ rootPath, absolutePath });
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
