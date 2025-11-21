import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";

// Event log entry types
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

// Session metadata
export interface SessionMetadata {
	cwd: string;
	cols: number;
	rows: number;
	startedAt: string;
	endedAt?: string;
	exitCode?: number;
	byteLength: number;
}

// History directory structure
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

/**
 * Writer for terminal history
 * Appends to existing history file across multiple sessions
 */
export class HistoryWriter {
	private writeStream: ReturnType<typeof createWriteStream> | null = null;
	private byteLength = 0;
	private metadata: SessionMetadata;
	private filePath: string;
	private metaPath: string;

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

		// Create directory
		await fs.mkdir(dir, { recursive: true });

		// Append to existing file (or create new)
		// We write raw NDJSON and compress on read for easier appending
		this.writeStream = createWriteStream(this.filePath, { flags: "a" });

		// Update metadata
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
		this.byteLength += data.length;
	}

	async writeExit(exitCode?: number, signal?: number): Promise<void> {
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

		await this.finalize(exitCode);
	}

	async finalize(exitCode?: number): Promise<void> {
		if (this.writeStream) {
			this.writeStream.end();
			await new Promise<void>((resolve) => {
				this.writeStream?.on("finish", () => resolve());
			});
			this.writeStream = null;
		}

		// Update final metadata
		this.metadata.endedAt = new Date().toISOString();
		this.metadata.exitCode = exitCode;
		this.metadata.byteLength = this.byteLength;
		await this.writeMetadata();
	}

	private async writeMetadata(): Promise<void> {
		try {
			await fs.writeFile(this.metaPath, JSON.stringify(this.metadata, null, 2));
		} catch (error) {
			console.error("Failed to write metadata:", error);
		}
	}

	isOpen(): boolean {
		return this.writeStream !== null;
	}
}

/**
 * Reader for terminal history
 * Reads history from appended NDJSON file
 */
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

			// Check if file exists
			try {
				await fs.access(filePath);
			} catch {
				// No history file
				return { scrollback: "", wasRecovered: false };
			}

			// Read metadata
			let metadata: SessionMetadata | undefined;
			try {
				const metaPath = getMetadataPath(this.workspaceId, this.tabId);
				const metaContent = await fs.readFile(metaPath, "utf-8");
				metadata = JSON.parse(metaContent);
			} catch {
				// Metadata not available
			}

			// Decode entire history file
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
		const MAX_CHARS = 100000; // Cap at 100k chars
		let scrollback = "";

		try {
			const readStream = createReadStream(filePath);

			const rl = readline.createInterface({
				input: readStream,
				crlfDelay: Number.POSITIVE_INFINITY,
			});

			for await (const line of rl) {
				try {
					const event = JSON.parse(line) as HistoryEvent;

					if (event.type === "data") {
						const data = Buffer.from(event.data, "base64").toString();
						scrollback += data;

						// Cap at MAX_CHARS to avoid huge payloads
						if (scrollback.length > MAX_CHARS) {
							scrollback = scrollback.slice(-MAX_CHARS);
						}
					}
				} catch {
					// Skip malformed lines
				}
			}

			// Return last MAX_CHARS
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
