/**
 * Terminal History Persistence (Phase 4)
 *
 * Provides cold restore capability by persisting terminal scrollback to disk.
 * This enables terminal recovery after app/system restarts when the daemon
 * is not running (unlike warm attach which reconnects to live daemon sessions).
 *
 * Storage format:
 * - scrollback.bin: Raw PTY output (append-only during session)
 * - meta.json: Session metadata (cols, rows, cwd, timestamps)
 *
 * Cold restore detection:
 * - meta.json exists but has no endedAt → unclean shutdown → can restore
 * - meta.json has endedAt → clean shutdown → no restore needed
 */

import { createWriteStream, promises as fs, type WriteStream } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";

const MAX_HISTORY_BYTES = 5 * 1024 * 1024; // 5MB per session
const MAX_PENDING_WRITE_BYTES = 256 * 1024; // cap in-memory backlog when disk is slow
const DRAIN_TIMEOUT_MS = 1000;
const HISTORY_DIR_MODE = 0o700;
const HISTORY_FILE_MODE = 0o600;

function isUtf8ContinuationByte(value: number): boolean {
	// Continuation bytes are 10xxxxxx.
	return (value & 0b1100_0000) === 0b1000_0000;
}

export function truncateUtf8ToLastBytes(
	input: string,
	maxBytes: number,
): string {
	if (maxBytes <= 0) return "";

	const buffer = Buffer.from(input, "utf8");
	if (buffer.length <= maxBytes) return input;

	let start = buffer.length - maxBytes;
	while (start < buffer.length && isUtf8ContinuationByte(buffer[start] ?? 0)) {
		start++;
	}

	return buffer.subarray(start).toString("utf8");
}

// =============================================================================
// Types
// =============================================================================

export interface SessionMetadata {
	cwd: string;
	cols: number;
	rows: number;
	startedAt: string;
	endedAt?: string;
	exitCode?: number;
}

// =============================================================================
// Path Helpers
// =============================================================================

const TERMINAL_HISTORY_DIR_NAME = "terminal-history";

export function getTerminalHistoryRootDir(): string {
	return join(homedir(), SUPERSET_DIR_NAME, TERMINAL_HISTORY_DIR_NAME);
}

function assertSafeIdSegment(label: string, value: string): void {
	if (!value || value.trim().length === 0) {
		throw new Error(`[terminal-history] ${label} must be non-empty`);
	}
	if (value.includes("/") || value.includes("\\") || value.includes("..")) {
		throw new Error(
			`[terminal-history] ${label} contains invalid path characters`,
		);
	}
}

function resolveHistoryDir(workspaceId: string, paneId: string): string {
	assertSafeIdSegment("workspaceId", workspaceId);
	assertSafeIdSegment("paneId", paneId);

	const root = resolve(getTerminalHistoryRootDir());
	const dir = resolve(root, workspaceId, paneId);
	const rel = relative(root, dir);

	if (rel.split(sep).includes("..")) {
		throw new Error("[terminal-history] Resolved history dir escapes root");
	}

	return dir;
}

function getHistoryDir(workspaceId: string, paneId: string): string {
	return resolveHistoryDir(workspaceId, paneId);
}

function getScrollbackPath(workspaceId: string, paneId: string): string {
	return join(getHistoryDir(workspaceId, paneId), "scrollback.bin");
}

function getMetadataPath(workspaceId: string, paneId: string): string {
	return join(getHistoryDir(workspaceId, paneId), "meta.json");
}

// =============================================================================
// HistoryWriter
// =============================================================================

/**
 * Writes terminal output to disk for cold restore.
 *
 * Usage:
 * 1. Create writer with session params
 * 2. Call init() with optional initial scrollback (from daemon snapshot)
 * 3. Call write() for each data event from PTY
 * 4. Call close() when session ends (writes endedAt to meta.json)
 */
export class HistoryWriter {
	private stream: WriteStream | null = null;
	private dir: string;
	private scrollbackPath: string;
	private metaPath: string;
	private metadata: SessionMetadata;
	private bytesWritten = 0;
	private streamErrored = false;
	private closed = false;
	private isBackpressured = false;
	private pendingWrites: Array<{ data: string; bytes: number }> = [];
	private pendingWriteBytes = 0;
	private warnedCapReached = false;
	private warnedBackpressureDrop = false;

	constructor(
		workspaceId: string,
		private paneId: string,
		cwd: string,
		cols: number,
		rows: number,
	) {
		this.dir = getHistoryDir(workspaceId, paneId);
		this.scrollbackPath = getScrollbackPath(workspaceId, paneId);
		this.metaPath = getMetadataPath(workspaceId, paneId);
		this.metadata = {
			cwd,
			cols,
			rows,
			startedAt: new Date().toISOString(),
		};
	}

	/**
	 * Initialize the history file.
	 * Creates the directory, writes initial scrollback, and opens append stream.
	 */
	async init(initialScrollback?: string): Promise<void> {
		await fs.mkdir(this.dir, { recursive: true, mode: HISTORY_DIR_MODE });

		// Write initial scrollback or create empty file
		// node-pty produces UTF-8 strings, so we store as UTF-8
		if (initialScrollback) {
			// Ensure initial scrollback doesn't exceed our per-session cap.
			const initialBytes = Buffer.byteLength(initialScrollback, "utf8");
			if (initialBytes > MAX_HISTORY_BYTES) {
				const truncated = truncateUtf8ToLastBytes(
					initialScrollback,
					MAX_HISTORY_BYTES,
				);
				await fs.writeFile(this.scrollbackPath, truncated, {
					encoding: "utf8",
					mode: HISTORY_FILE_MODE,
				});
				this.bytesWritten = Buffer.byteLength(truncated, "utf8");
				this.warnedCapReached = true;
				console.warn(
					`[HistoryWriter] Initial scrollback truncated for ${this.paneId} (${initialBytes} bytes > ${MAX_HISTORY_BYTES})`,
				);
			} else {
				await fs.writeFile(this.scrollbackPath, initialScrollback, {
					encoding: "utf8",
					mode: HISTORY_FILE_MODE,
				});
				this.bytesWritten = initialBytes;
			}
		} else {
			await fs.writeFile(this.scrollbackPath, Buffer.alloc(0), {
				mode: HISTORY_FILE_MODE,
			});
			this.bytesWritten = 0;
		}

		// Open stream in append mode for subsequent writes
		this.stream = createWriteStream(this.scrollbackPath, {
			flags: "a",
			mode: HISTORY_FILE_MODE,
		});
		this.stream.on("error", (error) => {
			console.error(
				`[HistoryWriter] Stream error for ${this.paneId}:`,
				error.message,
			);
			this.streamErrored = true;
			this.stream = null;
			this.pendingWrites = [];
			this.pendingWriteBytes = 0;
		});
		this.stream.on("drain", () => {
			this.isBackpressured = false;
			this.flushPendingWrites();
		});

		// Best-effort permission hardening (mode isn't updated on existing files).
		await fs.chmod(this.scrollbackPath, HISTORY_FILE_MODE).catch(() => {});

		// Write meta.json immediately (without endedAt)
		// This enables cold restore detection - if app crashes,
		// meta.json exists but has no endedAt, indicating unclean shutdown
		await this.writeMetadata();
	}

	/**
	 * Write terminal data to the scrollback file.
	 * Non-blocking - errors are swallowed to avoid disrupting terminal operation.
	 */
	write(data: string): void {
		if (this.closed || this.streamErrored || !this.stream) {
			return;
		}

		try {
			const bytes = Buffer.byteLength(data, "utf8");
			if (bytes === 0) {
				return;
			}

			// Hard cap disk usage per session (best-effort; drop beyond cap).
			if (this.bytesWritten + bytes > MAX_HISTORY_BYTES) {
				if (!this.warnedCapReached) {
					this.warnedCapReached = true;
					console.warn(
						`[HistoryWriter] History cap reached for ${this.paneId} (${MAX_HISTORY_BYTES} bytes); dropping additional output`,
					);
				}
				return;
			}

			// Respect filesystem backpressure. When disk is slow, stop feeding the
			// stream buffer and keep a small in-memory backlog; beyond that we drop.
			if (this.isBackpressured || this.pendingWrites.length > 0) {
				if (this.pendingWriteBytes + bytes > MAX_PENDING_WRITE_BYTES) {
					if (!this.warnedBackpressureDrop) {
						this.warnedBackpressureDrop = true;
						console.warn(
							`[HistoryWriter] Write backlog cap reached for ${this.paneId} (${MAX_PENDING_WRITE_BYTES} bytes); dropping history until drain`,
						);
					}
					return;
				}

				this.pendingWrites.push({ data, bytes });
				this.pendingWriteBytes += bytes;
				this.bytesWritten += bytes;
				return;
			}

			// node-pty produces UTF-8 strings
			this.bytesWritten += bytes;
			const ok = this.stream.write(data, "utf8");
			if (!ok) {
				this.isBackpressured = true;
			}
		} catch {
			this.streamErrored = true;
		}
	}

	private flushPendingWrites(): void {
		if (this.closed || this.streamErrored || !this.stream) {
			return;
		}
		if (this.isBackpressured) {
			return;
		}

		while (this.pendingWrites.length > 0) {
			const next = this.pendingWrites.shift();
			if (!next) return;
			this.pendingWriteBytes = Math.max(0, this.pendingWriteBytes - next.bytes);

			try {
				const ok = this.stream.write(next.data, "utf8");
				if (!ok) {
					this.isBackpressured = true;
					return;
				}
			} catch {
				this.streamErrored = true;
				this.stream = null;
				this.pendingWrites = [];
				this.pendingWriteBytes = 0;
				return;
			}
		}
	}

	/**
	 * Flush pending writes to disk.
	 * Returns a promise that resolves when data is flushed.
	 */
	async flush(): Promise<void> {
		if (this.closed || this.streamErrored || !this.stream) {
			return;
		}

		return new Promise<void>((resolve) => {
			this.flushPendingWrites();
			// Cork and uncork forces a flush
			this.stream?.once("drain", resolve);
			// If nothing to drain, resolve immediately
			if (this.stream?.writableLength === 0) {
				resolve();
			}
		});
	}

	/**
	 * Close the history file and write endedAt to metadata.
	 */
	async close(exitCode?: number): Promise<void> {
		if (this.closed) {
			return;
		}
		this.closed = true;

		// Best-effort: flush any pending backlog before closing.
		while (
			!this.streamErrored &&
			this.stream &&
			this.pendingWrites.length > 0
		) {
			this.flushPendingWrites();
			if (this.isBackpressured) {
				const stream = this.stream;
				if (!stream) break;

				const drained = await Promise.race([
					new Promise<boolean>((resolve) =>
						stream.once("drain", () => resolve(true)),
					),
					new Promise<boolean>((resolve) =>
						setTimeout(() => resolve(false), DRAIN_TIMEOUT_MS),
					),
				]);

				if (!drained) {
					break;
				}

				this.isBackpressured = false;
			}
		}
		this.pendingWrites = [];
		this.pendingWriteBytes = 0;

		// Close the stream
		if (this.stream && !this.streamErrored) {
			await new Promise<void>((resolve) => {
				this.stream?.end(() => resolve());
			}).catch(() => {
				// Ignore stream close errors
			});
		}
		this.stream = null;

		// Update metadata with end time
		this.metadata.endedAt = new Date().toISOString();
		if (exitCode !== undefined) {
			this.metadata.exitCode = exitCode;
		}

		await this.writeMetadata();
	}

	/**
	 * Reinitialize the history file (e.g., after clear scrollback).
	 * Closes the current stream and creates a fresh empty file.
	 */
	async reinitialize(): Promise<void> {
		// Close existing stream without writing endedAt
		if (this.stream && !this.streamErrored) {
			await new Promise<void>((resolve) => {
				this.stream?.end(() => resolve());
			}).catch(() => {
				// Ignore
			});
		}
		this.stream = null;
		this.streamErrored = false;
		this.closed = false;
		this.isBackpressured = false;
		this.pendingWrites = [];
		this.pendingWriteBytes = 0;
		this.bytesWritten = 0;
		this.warnedCapReached = false;
		this.warnedBackpressureDrop = false;

		// Reset metadata with new start time
		this.metadata.startedAt = new Date().toISOString();
		delete this.metadata.endedAt;
		delete this.metadata.exitCode;

		// Reinitialize with empty scrollback
		await this.init();
	}

	/**
	 * Delete all history files for this session.
	 */
	async deleteHistory(): Promise<void> {
		// Close stream first
		if (this.stream && !this.streamErrored) {
			await new Promise<void>((resolve) => {
				this.stream?.end(() => resolve());
			}).catch(() => {
				// Ignore
			});
		}
		this.stream = null;
		this.pendingWrites = [];
		this.pendingWriteBytes = 0;
		this.closed = true;

		// Delete the directory
		await fs.rm(this.dir, { recursive: true, force: true }).catch((error) => {
			console.warn(
				`[HistoryWriter] Failed to delete history for ${this.paneId}:`,
				error.message,
			);
		});
	}

	private async writeMetadata(): Promise<void> {
		try {
			await fs.writeFile(
				this.metaPath,
				JSON.stringify(this.metadata, null, 2),
				{
					mode: HISTORY_FILE_MODE,
				},
			);
			await fs.chmod(this.metaPath, HISTORY_FILE_MODE).catch(() => {});
		} catch (error) {
			console.warn(
				`[HistoryWriter] Failed to write metadata for ${this.paneId}:`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}
}

// =============================================================================
// HistoryReader
// =============================================================================

/**
 * Reads terminal history for cold restore.
 *
 * Usage:
 * 1. Create reader with workspace/pane IDs
 * 2. Check exists() to see if history is available
 * 3. Read metadata to check for unclean shutdown (no endedAt)
 * 4. Read scrollback to restore terminal content
 */
export class HistoryReader {
	private dir: string;
	private scrollbackPath: string;
	private metaPath: string;

	constructor(
		workspaceId: string,
		private paneId: string,
	) {
		this.dir = getHistoryDir(workspaceId, paneId);
		this.scrollbackPath = getScrollbackPath(workspaceId, paneId);
		this.metaPath = getMetadataPath(workspaceId, paneId);
	}

	/**
	 * Check if history exists for this session.
	 */
	async exists(): Promise<boolean> {
		try {
			await fs.access(this.metaPath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Read session metadata.
	 * Returns null if metadata doesn't exist or is invalid.
	 */
	async readMetadata(): Promise<{
		cols: number;
		rows: number;
		cwd: string;
		endedAt?: string;
	} | null> {
		try {
			const content = await fs.readFile(this.metaPath, "utf8");
			const metadata = JSON.parse(content) as SessionMetadata;

			return {
				cols: metadata.cols,
				rows: metadata.rows,
				cwd: metadata.cwd,
				endedAt: metadata.endedAt,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Read scrollback content.
	 * Returns null if scrollback doesn't exist.
	 */
	async readScrollback(): Promise<string | null> {
		try {
			// Read as UTF-8 to match how node-pty produces terminal output
			return await fs.readFile(this.scrollbackPath, "utf8");
		} catch {
			return null;
		}
	}

	/**
	 * Delete history files for this session.
	 */
	async cleanup(): Promise<void> {
		await fs.rm(this.dir, { recursive: true, force: true }).catch((error) => {
			console.warn(
				`[HistoryReader] Failed to cleanup history for ${this.paneId}:`,
				error instanceof Error ? error.message : String(error),
			);
		});
	}
}
