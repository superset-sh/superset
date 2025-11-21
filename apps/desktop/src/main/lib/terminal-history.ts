import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";

export interface HistoryDataEvent {
	t: number; // timestamp
	type: "data";
	data: string; // base64-encoded PTY bytes
}

export interface HistoryExitEvent {
	t: number;
	type: "exit";
	exitCode?: number;
	signal?: number;
}

export type HistoryEvent = HistoryDataEvent | HistoryExitEvent;

export interface SessionMetadata {
	cwd: string;
	cols: number;
	rows: number;
	startedAt: string;
	endedAt?: string;
	exitCode?: number;
	byteLength: number;
}

export function getHistoryDir(workspaceId: string, tabId: string): string {
	return join(homedir(), ".superset", "terminal-history", workspaceId, tabId);
}

export function getHistoryFilePath(workspaceId: string, tabId: string): string {
	const dir = getHistoryDir(workspaceId, tabId);
	return join(dir, "history.ndjson");
}

export function getMetadataPath(workspaceId: string, tabId: string): string {
	const dir = getHistoryDir(workspaceId, tabId);
	return join(dir, "meta.json");
}

export class HistoryWriter {
	private writeStream: ReturnType<typeof createWriteStream> | null = null;
	private byteLength = 0;
	private metadata: SessionMetadata;
	private filePath: string;
	private metaPath: string;
	private isFinalizing = false;
	private finalizePromise: Promise<void> | null = null;
	private finalized = false;

	constructor(
		private workspaceId: string,
		private tabId: string,
		cwd: string,
		cols: number,
		rows: number,
	) {
		this.filePath = getHistoryFilePath(workspaceId, tabId);
		this.metaPath = getMetadataPath(workspaceId, tabId);
		this.metadata = {
			cwd,
			cols,
			rows,
			startedAt: new Date().toISOString(),
			byteLength: 0,
		};
	}

	async init(): Promise<void> {
		const dir = getHistoryDir(this.workspaceId, this.tabId);

		await fs.mkdir(dir, { recursive: true });

		try {
			const stats = await fs.stat(this.filePath);
			this.byteLength = stats.size;
		} catch {
			this.byteLength = 0;
		}

		this.metadata.byteLength = this.byteLength;

		// We write raw NDJSON and compress on read for easier appending
		this.writeStream = createWriteStream(this.filePath, { flags: "a" });
		this.finalized = false;

		await this.writeMetadata();
	}

	writeData(data: string): void {
		if (!this.writeStream) {
			console.warn("HistoryWriter not initialized");
			return;
		}

		const event: HistoryDataEvent = {
			t: Date.now(),
			type: "data",
			data: Buffer.from(data).toString("base64"),
		};

		const line = `${JSON.stringify(event)}\n`;
		this.writeStream.write(line);
		this.byteLength += Buffer.byteLength(line);
	}

	async writeExit(exitCode?: number, signal?: number): Promise<void> {
		if (this.isFinalizing || this.finalizePromise) {
			await this.finalizePromise;
			return;
		}

		if (!this.writeStream) {
			console.warn("HistoryWriter not initialized");
			return;
		}

		const event: HistoryExitEvent = {
			t: Date.now(),
			type: "exit",
			exitCode,
			signal,
		};

		const line = `${JSON.stringify(event)}\n`;
		this.writeStream.write(line);
		this.byteLength += Buffer.byteLength(line);

		await this.finalize(exitCode);
	}

	async finalize(exitCode?: number): Promise<void> {
		if (this.finalizePromise) {
			return this.finalizePromise;
		}

		this.isFinalizing = true;
		this.finalized = true;
		this.finalizePromise = (async () => {
			if (this.writeStream) {
				await new Promise<void>((resolve, reject) => {
					this.writeStream?.once("finish", resolve);
					this.writeStream?.once("error", reject);
					this.writeStream?.end();
				});
				this.writeStream = null;
			}

			if (!this.metadata.endedAt) {
				this.metadata.endedAt = new Date().toISOString();
			}
			if (exitCode !== undefined) {
				this.metadata.exitCode = exitCode;
			}
			this.metadata.byteLength = this.byteLength;
			await this.writeMetadata();
		})().finally(() => {
			this.isFinalizing = false;
		});

		return this.finalizePromise;
	}

	private async writeMetadata(): Promise<void> {
		try {
			await fs.writeFile(this.metaPath, JSON.stringify(this.metadata, null, 2));
		} catch (error) {
			console.error("Failed to write metadata:", error);
		}
	}

	isOpen(): boolean {
		return this.writeStream !== null && !this.finalized;
	}
}

export class HistoryReader {
	constructor(
		private workspaceId: string,
		private tabId: string,
	) {}

	async getLatestSession(): Promise<{
		scrollback: string;
		wasRecovered: boolean;
		metadata?: SessionMetadata;
	}> {
		try {
			const filePath = getHistoryFilePath(this.workspaceId, this.tabId);

			try {
				await fs.access(filePath);
			} catch {
				return { scrollback: "", wasRecovered: false };
			}

			let metadata: SessionMetadata | undefined;
			try {
				const metaPath = getMetadataPath(this.workspaceId, this.tabId);
				const metaContent = await fs.readFile(metaPath, "utf-8");
				metadata = JSON.parse(metaContent);
			} catch {
				// Metadata not available
			}

			const scrollback = await this.decodeHistory(filePath);

			return {
				scrollback,
				wasRecovered: scrollback.length > 0,
				metadata,
			};
		} catch (error) {
			console.error("Failed to read history:", error);
			return { scrollback: "", wasRecovered: false };
		}
	}

	private async decodeHistory(filePath: string): Promise<string> {
		const MAX_CHARS = 100000;
		const MAX_BYTES_TO_READ = 500000;

		try {
			const stats = await fs.stat(filePath);
			const fileSize = stats.size;

			if (fileSize === 0) {
				return "";
			}

			const startPos = Math.max(0, fileSize - MAX_BYTES_TO_READ);

			const readStream = createReadStream(filePath, {
				start: startPos,
			});

			const rl = readline.createInterface({
				input: readStream,
				crlfDelay: Number.POSITIVE_INFINITY,
			});

			let scrollback = "";
			let isFirstLine = true;

			for await (const line of rl) {
				// Skip first partial line if we started mid-file
				if (isFirstLine && startPos > 0) {
					isFirstLine = false;
					continue;
				}

				try {
					const event = JSON.parse(line) as HistoryEvent;

					if (event.type === "data") {
						const data = Buffer.from(event.data, "base64").toString();
						scrollback += data;

						// Trim periodically to prevent memory issues, but keep reading to the end
						if (scrollback.length > MAX_CHARS * 2) {
							scrollback = scrollback.slice(-MAX_CHARS);
						}
					}
				} catch {
					// Skip malformed lines
				}
			}

			// Final trim to MAX_CHARS to ensure we return the most recent data
			if (scrollback.length > MAX_CHARS) {
				scrollback = scrollback.slice(-MAX_CHARS);
			}

			return scrollback;
		} catch (error) {
			console.error("Failed to decode history:", error);
			return "";
		}
	}

	async cleanup(): Promise<void> {
		try {
			const dir = getHistoryDir(this.workspaceId, this.tabId);
			await fs.rm(dir, { recursive: true, force: true });
		} catch (error) {
			console.error("Failed to cleanup history:", error);
		}
	}
}
