import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../../terminal-escape-filter";
import {
	HistoryReader,
	HistoryWriter,
	truncateUtf8ToLastBytes,
} from "../../terminal-history";
import { MAX_HISTORY_SCROLLBACK_BYTES } from "./constants";
import type { SessionInfo } from "./types";

export class HistoryManager {
	private historyWriters = new Map<string, HistoryWriter>();
	private pendingHistoryData = new Map<string, string[]>();
	private historyInitializing = new Set<string>();

	async initHistoryWriter({
		paneId,
		workspaceId,
		cwd,
		cols,
		rows,
		initialScrollback,
	}: {
		paneId: string;
		workspaceId: string;
		cwd: string;
		cols: number;
		rows: number;
		initialScrollback?: string;
	}): Promise<void> {
		this.historyInitializing.add(paneId);
		this.pendingHistoryData.set(paneId, []);

		let safeScrollback = initialScrollback;
		if (initialScrollback !== undefined) {
			if (typeof initialScrollback !== "string") {
				console.warn(
					`[HistoryManager] initialScrollback for ${paneId} is not a string, ignoring`,
				);
				safeScrollback = undefined;
			} else {
				const initialScrollbackBytes = Buffer.byteLength(
					initialScrollback,
					"utf8",
				);
				if (initialScrollbackBytes > MAX_HISTORY_SCROLLBACK_BYTES) {
					console.warn(
						`[HistoryManager] initialScrollback for ${paneId} too large (${initialScrollbackBytes} bytes), truncating to ${MAX_HISTORY_SCROLLBACK_BYTES}`,
					);
					safeScrollback = truncateUtf8ToLastBytes(
						initialScrollback,
						MAX_HISTORY_SCROLLBACK_BYTES,
					);
				}
			}
		}

		try {
			const writer = new HistoryWriter(workspaceId, paneId, cwd, cols, rows);
			await writer.init(safeScrollback);
			this.historyWriters.set(paneId, writer);

			const buffered = this.pendingHistoryData.get(paneId) || [];
			this.historyInitializing.delete(paneId);
			this.pendingHistoryData.delete(paneId);
			for (const data of buffered) {
				writer.write(data);
			}
		} catch (error) {
			console.error(
				`[HistoryManager] Failed to init history writer for ${paneId}:`,
				error,
			);
		} finally {
			this.historyInitializing.delete(paneId);
			this.pendingHistoryData.delete(paneId);
		}
	}

	writeToHistory(
		paneId: string,
		data: string,
		getSession: () => SessionInfo | undefined,
	): void {
		if (this.historyInitializing.has(paneId)) {
			const buffer = this.pendingHistoryData.get(paneId);
			if (buffer) {
				buffer.push(data);
			}
			return;
		}

		const writer = this.historyWriters.get(paneId);
		if (!writer) {
			return;
		}

		if (containsClearScrollbackSequence(data)) {
			const session = getSession();
			if (session) {
				writer.close().catch((error) => {
					console.warn(
						`[HistoryManager] Failed to close history writer for ${paneId}:`,
						error,
					);
				});
				this.historyWriters.delete(paneId);

				const contentAfterClear = extractContentAfterClear(data);
				this.initHistoryWriter({
					paneId,
					workspaceId: session.workspaceId,
					cwd: session.cwd,
					cols: session.cols,
					rows: session.rows,
					initialScrollback: contentAfterClear || undefined,
				}).catch((error) => {
					console.warn(
						`[HistoryManager] Failed to reinitialize history writer for ${paneId}:`,
						error,
					);
				});
			}
			return;
		}

		writer.write(data);
	}

	closeHistoryWriter(paneId: string, exitCode?: number): void {
		const writer = this.historyWriters.get(paneId);
		if (writer) {
			writer.close(exitCode).catch((error) => {
				console.error(
					`[HistoryManager] Failed to close history writer for ${paneId}:`,
					error,
				);
			});
			this.historyWriters.delete(paneId);
		}

		this.historyInitializing.delete(paneId);
		this.pendingHistoryData.delete(paneId);
	}

	async cleanupHistory(paneId: string, workspaceId: string): Promise<void> {
		this.closeHistoryWriter(paneId);

		try {
			const reader = new HistoryReader(workspaceId, paneId);
			await reader.cleanup();
		} catch (error) {
			console.error(
				`[HistoryManager] Failed to cleanup history for ${paneId}:`,
				error,
			);
		}
	}

	getHistoryWriter(paneId: string): HistoryWriter | undefined {
		return this.historyWriters.get(paneId);
	}

	async resetAll(sessions: Map<string, SessionInfo>): Promise<void> {
		const closePromises: Promise<void>[] = [];
		for (const [paneId, writer] of this.historyWriters.entries()) {
			closePromises.push(
				writer.close().catch((error) => {
					console.warn(
						`[HistoryManager] Failed to close history for ${paneId}:`,
						error,
					);
				}),
			);
		}
		await Promise.all(closePromises);
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();

		const initPromises: Promise<void>[] = [];
		for (const [paneId, session] of sessions.entries()) {
			if (!session.isAlive) continue;
			initPromises.push(
				this.initHistoryWriter({
					paneId,
					workspaceId: session.workspaceId,
					cwd: session.cwd,
					cols: session.cols,
					rows: session.rows,
					initialScrollback: undefined,
				}).catch((error) => {
					console.warn(
						`[HistoryManager] Failed to reinitialize history for ${paneId}:`,
						error,
					);
				}),
			);
		}
		await Promise.all(initPromises);
	}

	async cleanup(): Promise<void> {
		const closePromises: Promise<void>[] = [];
		for (const [paneId, writer] of this.historyWriters.entries()) {
			closePromises.push(
				writer.close().catch((error) => {
					console.error(
						`[HistoryManager] Failed to close history for ${paneId}:`,
						error,
					);
				}),
			);
		}
		await Promise.all(closePromises);
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();
	}

	async forceCloseAll(): Promise<void> {
		for (const writer of this.historyWriters.values()) {
			await writer.close().catch((error) => {
				console.warn(
					"[HistoryManager] Failed to close history writer during forceKillAll:",
					error,
				);
			});
		}
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();
	}

	closeAllSync(): void {
		for (const writer of this.historyWriters.values()) {
			writer.close().catch(() => {});
		}
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();
	}
}
