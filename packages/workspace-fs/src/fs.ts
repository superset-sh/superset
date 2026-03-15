import { createHash, randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isPathWithinRoot, normalizeAbsolutePath } from "./paths";
import type {
	FsEntry,
	FsEntryKind,
	FsMetadata,
	FsReadResult,
	FsWriteResult,
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

const PATH_LOCK_STALE_MS = 30_000;
const PATH_LOCK_RETRY_MS = 50;
const PATH_LOCK_TIMEOUT_MS = 5_000;

function isEnoent(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isEexist(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function toRevision(stats: { mtimeMs: number; size: number }): string {
	return `${stats.mtimeMs}:${stats.size}`;
}

function direntToKind(entry: Dirent): FsEntryKind {
	if (entry.isDirectory()) return "directory";
	if (entry.isSymbolicLink()) return "symlink";
	if (entry.isFile()) return "file";
	return "other";
}

function statsToKind(stats: Stats): FsEntryKind {
	if (stats.isDirectory()) return "directory";
	if (stats.isSymbolicLink()) return "symlink";
	if (stats.isFile()) return "file";
	return "other";
}

function contentToBuffer(
	content: string | Uint8Array,
	encoding?: string,
): Buffer {
	if (typeof content === "string") {
		return Buffer.from(content, (encoding as BufferEncoding) ?? "utf-8");
	}
	return Buffer.from(content);
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

function getPathLockDirectory(absolutePath: string): string {
	return path.join(
		os.tmpdir(),
		"superset-workspace-fs-locks",
		createHash("sha256")
			.update(normalizeAbsolutePath(absolutePath))
			.digest("hex"),
	);
}

async function sleep(delayMs: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withPathLock<T>(
	absolutePath: string,
	callback: () => Promise<T>,
): Promise<T> {
	const lockDirectory = getPathLockDirectory(absolutePath);
	await fs.mkdir(path.dirname(lockDirectory), { recursive: true });

	const deadline = Date.now() + PATH_LOCK_TIMEOUT_MS;
	while (true) {
		try {
			await fs.mkdir(lockDirectory);
			break;
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!("code" in error) ||
				error.code !== "EEXIST"
			) {
				throw error;
			}

			try {
				const stats = await fs.stat(lockDirectory);
				if (Date.now() - stats.mtimeMs > PATH_LOCK_STALE_MS) {
					await fs.rm(lockDirectory, { recursive: true, force: true });
					continue;
				}
			} catch (statError) {
				if (
					statError instanceof Error &&
					"code" in statError &&
					statError.code === "ENOENT"
				) {
					continue;
				}
				throw statError;
			}

			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out waiting for filesystem path lock: ${absolutePath}`,
				);
			}

			await sleep(PATH_LOCK_RETRY_MS);
		}
	}

	try {
		return await callback();
	} finally {
		await fs.rm(lockDirectory, { recursive: true, force: true });
	}
}

async function writeAtomically({
	rootPath,
	absolutePath,
	content,
	encoding,
}: {
	rootPath: string;
	absolutePath: string;
	content: string | Uint8Array;
	encoding?: string;
}): Promise<void> {
	const tempPath = `${absolutePath}.superset-tmp-${randomUUID()}`;
	await assertParentWithinRoot(rootPath, tempPath);

	let sourceMode: number | undefined;
	try {
		const currentStats = await fs.stat(absolutePath);
		sourceMode = currentStats.mode;
	} catch (error) {
		if (!isEnoent(error)) {
			throw error;
		}
	}

	const buffer = contentToBuffer(content, encoding);

	try {
		await fs.writeFile(tempPath, buffer);
		if (sourceMode !== undefined) {
			await fs.chmod(tempPath, sourceMode);
		}
		await fs.rename(tempPath, absolutePath);
	} finally {
		await fs.rm(tempPath, { force: true });
	}
}

export async function listDirectory({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<FsEntry[]> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	const entries = await fs.readdir(targetPath, { withFileTypes: true });

	return entries
		.map((entry) => ({
			absolutePath: path.join(targetPath, entry.name),
			name: entry.name,
			kind: direntToKind(entry),
		}))
		.sort((left, right) => {
			const leftIsDir = left.kind === "directory";
			const rightIsDir = right.kind === "directory";
			if (leftIsDir !== rightIsDir) {
				return leftIsDir ? -1 : 1;
			}
			return left.name.localeCompare(right.name);
		});
}

export async function readFile({
	rootPath,
	absolutePath,
	offset,
	maxBytes,
	encoding,
}: {
	rootPath: string;
	absolutePath: string;
	offset?: number;
	maxBytes?: number;
	encoding?: string;
}): Promise<FsReadResult> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await assertRealpathWithinRoot(rootPath, targetPath);

	const fileHandle = await fs.open(targetPath, "r");
	try {
		const stats = await fileHandle.stat();
		const revision = toRevision(stats);
		const fileSize = stats.size;
		const startOffset = offset ?? 0;
		const remaining = Math.max(0, fileSize - startOffset);

		if (maxBytes !== undefined) {
			const bytesToAttempt = Math.min(maxBytes + 1, remaining);
			const buffer = Buffer.allocUnsafe(Math.max(bytesToAttempt, 0));
			const { bytesRead } = await fileHandle.read(
				buffer,
				0,
				bytesToAttempt,
				startOffset,
			);
			const exceededLimit = bytesRead > maxBytes;
			const actualBytes = Math.min(bytesRead, maxBytes);
			const resultBuffer = buffer.subarray(0, actualBytes);

			if (encoding) {
				return {
					kind: "text",
					content: resultBuffer.toString(encoding as BufferEncoding),
					byteLength: actualBytes,
					exceededLimit,
					revision,
				};
			}
			return {
				kind: "bytes",
				content: new Uint8Array(resultBuffer),
				byteLength: actualBytes,
				exceededLimit,
				revision,
			};
		}

		const buffer = Buffer.allocUnsafe(remaining);
		const { bytesRead } =
			remaining > 0
				? await fileHandle.read(buffer, 0, remaining, startOffset)
				: { bytesRead: 0 };
		const resultBuffer = buffer.subarray(0, bytesRead);

		if (encoding) {
			return {
				kind: "text",
				content: resultBuffer.toString(encoding as BufferEncoding),
				byteLength: bytesRead,
				exceededLimit: false,
				revision,
			};
		}
		return {
			kind: "bytes",
			content: new Uint8Array(resultBuffer),
			byteLength: bytesRead,
			exceededLimit: false,
			revision,
		};
	} finally {
		await fileHandle.close();
	}
}

export async function getMetadata({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<FsMetadata | null> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });

	try {
		const stats = await fs.lstat(targetPath);
		const kind = statsToKind(stats);

		let symlinkTarget: string | undefined;
		if (stats.isSymbolicLink()) {
			try {
				symlinkTarget = await fs.readlink(targetPath);
			} catch {}
		}

		return {
			absolutePath: targetPath,
			kind,
			size: stats.size,
			createdAt: stats.birthtime.toISOString(),
			modifiedAt: stats.mtime.toISOString(),
			accessedAt: stats.atime.toISOString(),
			mode: stats.mode,
			revision: toRevision(stats),
			symlinkTarget,
		};
	} catch (error) {
		if (isEnoent(error)) {
			return null;
		}
		throw error;
	}
}

export async function writeFile({
	rootPath,
	absolutePath,
	content,
	encoding,
	options,
	precondition,
}: {
	rootPath: string;
	absolutePath: string;
	content: string | Uint8Array;
	encoding?: string;
	options?: { create: boolean; overwrite: boolean };
	precondition?: { ifMatch: string };
}): Promise<FsWriteResult> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	await assertRealpathWithinRoot(rootPath, targetPath);

	const create = options?.create ?? true;
	const overwrite = options?.overwrite ?? true;

	if (!create && !overwrite) {
		throw new Error(
			"Invalid writeFile options: create and overwrite cannot both be false",
		);
	}

	const execute = async (): Promise<FsWriteResult> => {
		if (precondition?.ifMatch !== undefined) {
			try {
				const stats = await fs.lstat(targetPath);
				const currentRevision = toRevision(stats);
				if (currentRevision !== precondition.ifMatch) {
					return { ok: false, reason: "conflict", currentRevision };
				}
			} catch (error) {
				if (isEnoent(error)) {
					return { ok: false, reason: "conflict", currentRevision: "" };
				}
				throw error;
			}
		}

		if (create && !overwrite) {
			const buffer = contentToBuffer(content, encoding);
			try {
				await fs.writeFile(targetPath, buffer, { flag: "wx" });
			} catch (error) {
				if (isEexist(error)) {
					return { ok: false, reason: "exists" };
				}
				throw error;
			}
			const stats = await fs.stat(targetPath);
			return { ok: true, revision: toRevision(stats) };
		}

		if (!create && overwrite) {
			try {
				await fs.access(targetPath);
			} catch (error) {
				if (isEnoent(error)) {
					return { ok: false, reason: "not-found" };
				}
				throw error;
			}
		}

		await writeAtomically({
			rootPath,
			absolutePath: targetPath,
			content,
			encoding,
		});
		const stats = await fs.stat(targetPath);
		return { ok: true, revision: toRevision(stats) };
	};

	if (precondition?.ifMatch !== undefined) {
		return await withPathLock(targetPath, execute);
	}

	return await execute();
}

export async function createDirectory({
	rootPath,
	absolutePath,
}: {
	rootPath: string;
	absolutePath: string;
}): Promise<{ absolutePath: string; kind: "directory" }> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	try {
		await fs.mkdir(targetPath);
	} catch (error) {
		if (!isEexist(error)) {
			throw error;
		}
		const stats = await fs.lstat(targetPath);
		if (!stats.isDirectory()) {
			throw error;
		}
	}
	return { absolutePath: targetPath, kind: "directory" };
}

export async function deletePath({
	rootPath,
	absolutePath,
	permanent = false,
	trashItem,
}: {
	rootPath: string;
	absolutePath: string;
	permanent?: boolean;
	trashItem?: (absolutePath: string) => Promise<void>;
}): Promise<{ absolutePath: string }> {
	if (normalizeAbsolutePath(absolutePath) === normalizeAbsolutePath(rootPath)) {
		throw new WorkspaceFsPathError(
			"Cannot target workspace root",
			"INVALID_TARGET",
		);
	}

	const targetPath = ensureWithinRoot({ rootPath, absolutePath });

	if (!permanent && trashItem) {
		await trashItem(targetPath);
		return { absolutePath: targetPath };
	}

	let stats: Stats;
	try {
		stats = await fs.lstat(targetPath);
	} catch (error) {
		if (isEnoent(error)) {
			return { absolutePath: targetPath };
		}
		throw error;
	}

	if (stats.isSymbolicLink()) {
		await fs.rm(targetPath);
		return { absolutePath: targetPath };
	}

	await assertRealpathWithinRoot(rootPath, targetPath);
	await fs.rm(targetPath, { recursive: true, force: true });
	return { absolutePath: targetPath };
}

export async function movePath({
	rootPath,
	sourceAbsolutePath,
	destinationAbsolutePath,
}: {
	rootPath: string;
	sourceAbsolutePath: string;
	destinationAbsolutePath: string;
}): Promise<{ fromAbsolutePath: string; toAbsolutePath: string }> {
	const sourcePath = ensureWithinRoot({
		rootPath,
		absolutePath: sourceAbsolutePath,
	});
	const destinationPath = ensureWithinRoot({
		rootPath,
		absolutePath: destinationAbsolutePath,
	});

	await fs.access(destinationPath).then(
		() => {
			throw new Error(`Destination already exists: ${destinationPath}`);
		},
		(error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") {
				throw error;
			}
		},
	);

	await fs.rename(sourcePath, destinationPath);
	return { fromAbsolutePath: sourcePath, toAbsolutePath: destinationPath };
}

export async function copyPath({
	rootPath,
	sourceAbsolutePath,
	destinationAbsolutePath,
}: {
	rootPath: string;
	sourceAbsolutePath: string;
	destinationAbsolutePath: string;
}): Promise<{ fromAbsolutePath: string; toAbsolutePath: string }> {
	const sourcePath = ensureWithinRoot({
		rootPath,
		absolutePath: sourceAbsolutePath,
	});
	const destinationPath = ensureWithinRoot({
		rootPath,
		absolutePath: destinationAbsolutePath,
	});

	await fs.cp(sourcePath, destinationPath, { recursive: true });
	return { fromAbsolutePath: sourcePath, toAbsolutePath: destinationPath };
}
