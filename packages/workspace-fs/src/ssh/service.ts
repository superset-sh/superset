import path from "node:path";
import type {
	WorkspaceFsCreateDirectoryInput,
	WorkspaceFsCreateFileInput,
	WorkspaceFsDeletePathsInput,
	WorkspaceFsDirectoryQuery,
	WorkspaceFsLimitedReadInput,
	WorkspaceFsLocation,
	WorkspaceFsMoveCopyInput,
	WorkspaceFsRenameInput,
	WorkspaceFsSearchFilesInput,
	WorkspaceFsService,
	WorkspaceFsServiceInfo,
	WorkspaceFsWatchInput,
	WorkspaceFsWriteFileInput,
} from "../core/service";
import type {
	DeletePathsResult,
	MoveCopyResult,
	WorkspaceFsEntry,
	WorkspaceFsExistsResult,
	WorkspaceFsGuardedWriteResult,
	WorkspaceFsKeywordMatch,
	WorkspaceFsLimitedReadResult,
	WorkspaceFsSearchResult,
	WorkspaceFsStat,
	WorkspaceFsWatchEvent,
} from "../types";

// ---------------------------------------------------------------------------
// Minimal local SFTP interface — avoids an ssh2 package dependency.
// The caller passes a real ssh2 SFTPWrapper which satisfies this shape.
// ---------------------------------------------------------------------------

export interface SftpFileAttrs {
	mode: number;
	size: number;
	atime: number;
	mtime: number;
}

export interface SftpFileEntry {
	filename: string;
	attrs: SftpFileAttrs;
}

export interface SftpStats {
	mode: number;
	size: number;
	atime: number;
	mtime: number;
}

export interface SftpWrapper {
	readdir(
		path: string,
		callback: (err: Error | null, list: SftpFileEntry[]) => void,
	): void;
	readFile(
		path: string,
		callback: (err: Error | null, data: Buffer) => void,
	): void;
	writeFile(
		path: string,
		data: string | Buffer,
		callback: (err: Error | null) => void,
	): void;
	stat(
		path: string,
		callback: (err: Error | null, stats: SftpStats) => void,
	): void;
	unlink(path: string, callback: (err: Error | null) => void): void;
	rmdir(path: string, callback: (err: Error | null) => void): void;
	mkdir(path: string, callback: (err: Error | null) => void): void;
	rename(
		oldPath: string,
		newPath: string,
		callback: (err: Error | null) => void,
	): void;
}

// ---------------------------------------------------------------------------
// S_IF constants from POSIX
// ---------------------------------------------------------------------------

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function modeToKind(mode: number): "directory" | "symlink" | "file" {
	const fmt = mode & S_IFMT;
	if (fmt === S_IFDIR) return "directory";
	if (fmt === S_IFLNK) return "symlink";
	return "file";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function posixRelative(rootPath: string, absolutePath: string): string {
	// Use path.posix for remote paths
	const rel = path.posix.relative(rootPath, absolutePath);
	return rel === "" ? "." : rel;
}

function toEntry(
	rootPath: string,
	absolutePath: string,
	isDirectory: boolean,
): WorkspaceFsEntry {
	return {
		id: absolutePath,
		name: path.posix.basename(absolutePath),
		absolutePath,
		relativePath: posixRelative(rootPath, absolutePath),
		isDirectory,
	};
}

// Promisified SFTP wrappers

function sftpReaddir(
	sftp: SftpWrapper,
	dirPath: string,
): Promise<SftpFileEntry[]> {
	return new Promise((resolve, reject) => {
		sftp.readdir(dirPath, (err, list) => {
			if (err) reject(err);
			else resolve(list);
		});
	});
}

function sftpReadFile(sftp: SftpWrapper, filePath: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		sftp.readFile(filePath, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		});
	});
}

function sftpWriteFile(
	sftp: SftpWrapper,
	filePath: string,
	data: string | Buffer,
): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.writeFile(filePath, data, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

function sftpStat(sftp: SftpWrapper, filePath: string): Promise<SftpStats> {
	return new Promise((resolve, reject) => {
		sftp.stat(filePath, (err, stats) => {
			if (err) reject(err);
			else resolve(stats);
		});
	});
}

function sftpUnlink(sftp: SftpWrapper, filePath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.unlink(filePath, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

function sftpRmdir(sftp: SftpWrapper, dirPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.rmdir(dirPath, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

function sftpMkdir(sftp: SftpWrapper, dirPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.mkdir(dirPath, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

function sftpRename(
	sftp: SftpWrapper,
	oldPath: string,
	newPath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.rename(oldPath, newPath, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

async function sftpDeleteRecursive(
	sftp: SftpWrapper,
	targetPath: string,
): Promise<void> {
	let stats: SftpStats;
	try {
		stats = await sftpStat(sftp, targetPath);
	} catch {
		return;
	}

	if ((stats.mode & S_IFMT) === S_IFDIR) {
		const entries = await sftpReaddir(sftp, targetPath);
		await Promise.all(
			entries
				.filter((e) => e.filename !== "." && e.filename !== "..")
				.map((e) =>
					sftpDeleteRecursive(sftp, path.posix.join(targetPath, e.filename)),
				),
		);
		await sftpRmdir(sftp, targetPath);
	} else {
		await sftpUnlink(sftp, targetPath);
	}
}

function statsToWorkspaceFsStat(stats: SftpStats): WorkspaceFsStat {
	const kind = modeToKind(stats.mode);
	const modifiedAt = new Date(stats.mtime * 1000).toISOString();
	const accessedAt = new Date(stats.atime * 1000).toISOString();
	// SFTP does not expose ctime/birthtime reliably; use mtime as fallback
	const createdAt = modifiedAt;

	return {
		size: stats.size,
		isDirectory: kind === "directory",
		isFile: kind === "file",
		isSymbolicLink: kind === "symlink",
		createdAt,
		modifiedAt,
		accessedAt,
	};
}

function shellEscape(str: string): string {
	return `'${str.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// Public options interface
// ---------------------------------------------------------------------------

export interface SshWorkspaceFsServiceOptions {
	/**
	 * Returns an SFTP client for the remote connection.
	 * The returned object must satisfy the SftpWrapper interface (ssh2 SFTPWrapper does).
	 */
	getSftp: () => Promise<SftpWrapper>;
	/**
	 * Executes a command on the remote host and returns stdout/stderr/exitCode.
	 */
	execCommand: (
		command: string,
	) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
	/**
	 * Resolves the absolute root path on the remote host for a given workspaceId.
	 */
	resolveRootPath: (workspaceId: string) => string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSshWorkspaceFsService(
	options: SshWorkspaceFsServiceOptions,
): WorkspaceFsService {
	const { getSftp, execCommand, resolveRootPath } = options;

	return {
		async getServiceInfo(): Promise<WorkspaceFsServiceInfo> {
			return {
				hostKind: "remote",
				resourceScheme: "superset-workspace",
				pathIdentity: "absolute-path",
				capabilities: {
					read: true,
					write: true,
					watch: true,
					searchFiles: true,
					searchKeyword: true,
					trash: false,
					resourceUris: false,
				},
			};
		},

		async listDirectory(
			input: WorkspaceFsDirectoryQuery,
		): Promise<WorkspaceFsEntry[]> {
			const rootPath = resolveRootPath(input.workspaceId);
			const sftp = await getSftp();
			const entries = await sftpReaddir(sftp, input.absolutePath);
			return entries
				.filter((e) => e.filename !== "." && e.filename !== "..")
				.map((e) => {
					const entryPath = path.posix.join(input.absolutePath, e.filename);
					const isDirectory = (e.attrs.mode & S_IFMT) === S_IFDIR;
					return toEntry(rootPath, entryPath, isDirectory);
				});
		},

		async readTextFile(input: WorkspaceFsLocation): Promise<string> {
			const sftp = await getSftp();
			const data = await sftpReadFile(sftp, input.absolutePath);
			return data.toString("utf-8");
		},

		async readFileBuffer(input: WorkspaceFsLocation): Promise<Uint8Array> {
			const sftp = await getSftp();
			const data = await sftpReadFile(sftp, input.absolutePath);
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		},

		async readFileBufferUpTo(
			input: WorkspaceFsLimitedReadInput,
		): Promise<WorkspaceFsLimitedReadResult> {
			const sftp = await getSftp();
			const data = await sftpReadFile(sftp, input.absolutePath);
			const exceededLimit = data.byteLength > input.maxBytes;
			const sliced = exceededLimit ? data.subarray(0, input.maxBytes) : data;
			return {
				buffer: new Uint8Array(
					sliced.buffer,
					sliced.byteOffset,
					sliced.byteLength,
				),
				exceededLimit,
			};
		},

		async stat(input: WorkspaceFsLocation): Promise<WorkspaceFsStat> {
			const sftp = await getSftp();
			const stats = await sftpStat(sftp, input.absolutePath);
			return statsToWorkspaceFsStat(stats);
		},

		async exists(input: WorkspaceFsLocation): Promise<WorkspaceFsExistsResult> {
			const sftp = await getSftp();
			try {
				const stats = await sftpStat(sftp, input.absolutePath);
				const kind = modeToKind(stats.mode);
				return {
					exists: true,
					isDirectory: kind === "directory",
					isFile: kind === "file",
				};
			} catch {
				return { exists: false, isDirectory: false, isFile: false };
			}
		},

		async writeTextFile(input: WorkspaceFsWriteFileInput): Promise<void> {
			const sftp = await getSftp();
			await sftpWriteFile(sftp, input.absolutePath, input.content);
		},

		async guardedWriteTextFile(
			input: WorkspaceFsWriteFileInput,
		): Promise<WorkspaceFsGuardedWriteResult> {
			const sftp = await getSftp();

			if (input.expectedContent !== undefined) {
				let currentContent: string | null = null;
				try {
					const data = await sftpReadFile(sftp, input.absolutePath);
					currentContent = data.toString("utf-8");
				} catch {
					// File does not exist; current content stays null
				}

				if (currentContent !== input.expectedContent) {
					return { status: "conflict", currentContent };
				}
			}

			await sftpWriteFile(sftp, input.absolutePath, input.content);
			return { status: "saved" };
		},

		async createFile(
			input: WorkspaceFsCreateFileInput,
		): Promise<{ absolutePath: string }> {
			const sftp = await getSftp();
			await sftpWriteFile(sftp, input.absolutePath, input.content ?? "");
			return { absolutePath: input.absolutePath };
		},

		async createDirectory(
			input: WorkspaceFsCreateDirectoryInput,
		): Promise<{ absolutePath: string }> {
			const sftp = await getSftp();
			await sftpMkdir(sftp, input.absolutePath);
			return { absolutePath: input.absolutePath };
		},

		async rename(
			input: WorkspaceFsRenameInput,
		): Promise<{ oldAbsolutePath: string; newAbsolutePath: string }> {
			const sftp = await getSftp();
			const newAbsolutePath = path.posix.join(
				path.posix.dirname(input.absolutePath),
				input.newName,
			);
			await sftpRename(sftp, input.absolutePath, newAbsolutePath);
			return { oldAbsolutePath: input.absolutePath, newAbsolutePath };
		},

		async deletePaths(
			input: WorkspaceFsDeletePathsInput,
		): Promise<DeletePathsResult> {
			const sftp = await getSftp();
			const deleted: string[] = [];
			const errors: Array<{ absolutePath: string; error: string }> = [];

			for (const absolutePath of input.absolutePaths) {
				try {
					await sftpDeleteRecursive(sftp, absolutePath);
					deleted.push(absolutePath);
				} catch (error) {
					errors.push({
						absolutePath,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			return { deleted, errors };
		},

		async movePaths(input: WorkspaceFsMoveCopyInput): Promise<MoveCopyResult> {
			const entries: Array<{ from: string; to: string }> = [];
			const errors: Array<{ absolutePath: string; error: string }> = [];

			for (const absolutePath of input.absolutePaths) {
				const to = path.posix.join(
					input.destinationAbsolutePath,
					path.posix.basename(absolutePath),
				);
				try {
					const result = await execCommand(
						`mv ${shellEscape(absolutePath)} ${shellEscape(to)}`,
					);
					if (result.exitCode !== 0) {
						throw new Error(
							result.stderr || `mv exited with code ${result.exitCode}`,
						);
					}
					entries.push({ from: absolutePath, to });
				} catch (error) {
					errors.push({
						absolutePath,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			return { entries, errors };
		},

		async copyPaths(input: WorkspaceFsMoveCopyInput): Promise<MoveCopyResult> {
			const entries: Array<{ from: string; to: string }> = [];
			const errors: Array<{ absolutePath: string; error: string }> = [];

			for (const absolutePath of input.absolutePaths) {
				const to = path.posix.join(
					input.destinationAbsolutePath,
					path.posix.basename(absolutePath),
				);
				try {
					const result = await execCommand(
						`cp -r ${shellEscape(absolutePath)} ${shellEscape(to)}`,
					);
					if (result.exitCode !== 0) {
						throw new Error(
							result.stderr || `cp exited with code ${result.exitCode}`,
						);
					}
					entries.push({ from: absolutePath, to });
				} catch (error) {
					errors.push({
						absolutePath,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			return { entries, errors };
		},

		async searchFiles(
			input: WorkspaceFsSearchFilesInput,
		): Promise<WorkspaceFsSearchResult[]> {
			const rootPath = resolveRootPath(input.workspaceId);
			const limit = input.limit ?? 100;
			const namePattern = input.includePattern ?? `*${input.query}*`;
			const hiddenFlag = input.includeHidden ? "" : " ! -name '.*'";
			const excludeFilter = input.excludePattern
				? ` ! -path ${shellEscape(`*${input.excludePattern}*`)}`
				: "";

			const cmd = `find ${shellEscape(rootPath)} -name ${shellEscape(namePattern)}${hiddenFlag}${excludeFilter} -maxdepth 10 2>/dev/null | head -${limit}`;
			const result = await execCommand(cmd);
			const lines = result.stdout
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);

			return lines.map((absolutePath, index) => {
				const name = path.posix.basename(absolutePath);
				const relativePath = posixRelative(rootPath, absolutePath);
				return {
					id: absolutePath,
					name,
					absolutePath,
					relativePath,
					isDirectory: false,
					score: limit - index,
				} satisfies WorkspaceFsSearchResult;
			});
		},

		async searchKeyword(
			input: WorkspaceFsSearchFilesInput,
		): Promise<WorkspaceFsKeywordMatch[]> {
			const rootPath = resolveRootPath(input.workspaceId);
			const limit = input.limit ?? 100;
			const includeArg = input.includePattern
				? ` --include=${shellEscape(input.includePattern)}`
				: "";
			const excludeArg = input.excludePattern
				? ` --exclude=${shellEscape(input.excludePattern)}`
				: "";

			// grep -rn outputs: filepath:lineNum:content
			const cmd = `grep -rn${includeArg}${excludeArg} ${shellEscape(input.query)} ${shellEscape(rootPath)} 2>/dev/null | head -${limit}`;
			const result = await execCommand(cmd);
			const lines = result.stdout
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);

			const matches: WorkspaceFsKeywordMatch[] = [];
			for (const line of lines) {
				const firstColon = line.indexOf(":");
				if (firstColon === -1) continue;
				const secondColon = line.indexOf(":", firstColon + 1);
				if (secondColon === -1) continue;

				const absolutePath = line.slice(0, firstColon);
				const lineNum = Number.parseInt(
					line.slice(firstColon + 1, secondColon),
					10,
				);
				const preview = line.slice(secondColon + 1).trim();

				if (!absolutePath || Number.isNaN(lineNum)) continue;

				const name = path.posix.basename(absolutePath);
				const relativePath = posixRelative(rootPath, absolutePath);
				const column = Math.max(0, preview.indexOf(input.query));

				matches.push({
					id: `${absolutePath}:${lineNum}`,
					name,
					absolutePath,
					relativePath,
					isDirectory: false,
					line: lineNum,
					column,
					preview,
				} satisfies WorkspaceFsKeywordMatch);
			}

			return matches;
		},

		watchWorkspace(
			input: WorkspaceFsWatchInput,
		): AsyncIterable<WorkspaceFsWatchEvent> {
			const rootPath = resolveRootPath(input.workspaceId);
			const workspaceId = input.workspaceId;
			let revision = 0;

			return {
				[Symbol.asyncIterator](): AsyncIterator<WorkspaceFsWatchEvent> {
					const queue: WorkspaceFsWatchEvent[] = [];
					const waiters: Array<{
						resolve: (v: IteratorResult<WorkspaceFsWatchEvent>) => void;
						reject: (e: unknown) => void;
					}> = [];
					let closed = false;
					let cleanupFn: (() => void) | null = null;

					function push(event: WorkspaceFsWatchEvent): void {
						if (closed) return;
						const waiter = waiters.shift();
						if (waiter) {
							waiter.resolve({ value: event, done: false });
						} else {
							queue.push(event);
						}
					}

					function close(): void {
						if (closed) return;
						closed = true;
						cleanupFn?.();
						for (const waiter of waiters) {
							waiter.resolve({
								value: undefined as unknown as WorkspaceFsWatchEvent,
								done: true,
							});
						}
						waiters.length = 0;
					}

					// Polling-based watch: snapshot the tree every 2 seconds via find
					let pollInterval: ReturnType<typeof setInterval> | null = null;
					let lastStats: Map<string, string> = new Map();

					async function pollOnce(): Promise<void> {
						if (closed) return;
						try {
							const result = await execCommand(
								`find ${shellEscape(rootPath)} -maxdepth 5 -printf '%p %T@\\n' 2>/dev/null | sort`,
							);
							const current: Map<string, string> = new Map();
							for (const line of result.stdout.split("\n").filter(Boolean)) {
								const spaceIdx = line.lastIndexOf(" ");
								if (spaceIdx === -1) continue;
								const p = line.slice(0, spaceIdx);
								const t = line.slice(spaceIdx + 1);
								current.set(p, t);
							}

							if (lastStats.size > 0) {
								for (const [p, t] of current) {
									if (!lastStats.has(p)) {
										revision++;
										push({
											type: "create",
											workspaceId,
											absolutePath: p,
											isDirectory: false,
											revision,
										});
									} else if (lastStats.get(p) !== t) {
										revision++;
										push({
											type: "update",
											workspaceId,
											absolutePath: p,
											isDirectory: false,
											revision,
										});
									}
								}
								for (const p of lastStats.keys()) {
									if (!current.has(p)) {
										revision++;
										push({
											type: "delete",
											workspaceId,
											absolutePath: p,
											isDirectory: false,
											revision,
										});
									}
								}
							}

							lastStats = current;
						} catch {
							// Ignore transient poll errors
						}
					}

					// Start with an initial snapshot then poll every 2s
					void pollOnce();
					pollInterval = setInterval(() => {
						void pollOnce();
					}, 2000);

					cleanupFn = () => {
						if (pollInterval !== null) {
							clearInterval(pollInterval);
							pollInterval = null;
						}
					};

					return {
						async next(): Promise<IteratorResult<WorkspaceFsWatchEvent>> {
							if (queue.length > 0) {
								return { value: queue.shift()!, done: false };
							}
							if (closed) {
								return {
									value: undefined as unknown as WorkspaceFsWatchEvent,
									done: true,
								};
							}
							return new Promise<IteratorResult<WorkspaceFsWatchEvent>>(
								(resolve, reject) => {
									waiters.push({ resolve, reject });
								},
							);
						},
						async return(): Promise<IteratorResult<WorkspaceFsWatchEvent>> {
							close();
							return {
								value: undefined as unknown as WorkspaceFsWatchEvent,
								done: true,
							};
						},
					};
				},
			};
		},
	};
}
