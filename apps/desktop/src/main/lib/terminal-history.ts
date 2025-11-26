import { createWriteStream, promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

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

// Use environment variable or tmpdir for tests
const getBaseDir = () => {
	if (process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test") {
		return join(tmpdir(), "superset-test");
	}
	return homedir();
};

export function getHistoryDir(workspaceId: string, tabId: string): string {
	return join(
		getBaseDir(),
		".superset",
		"terminal-history",
		workspaceId,
		tabId,
	);
}

export function getHistoryFilePath(workspaceId: string, tabId: string): string {
	const dir = getHistoryDir(workspaceId, tabId);
	return join(dir, "history.ndjson");
}

export class HistoryWriter {
	private writeStream: ReturnType<typeof createWriteStream> | null = null;
	private filePath: string;
	private finalizePromise: Promise<void> | null = null;

	constructor(
		private workspaceId: string,
		private tabId: string,
	) {
		this.filePath = getHistoryFilePath(workspaceId, tabId);
	}

	async init(): Promise<void> {
		const dir = getHistoryDir(this.workspaceId, this.tabId);

		await fs.mkdir(dir, { recursive: true });

		this.writeStream = createWriteStream(this.filePath, { flags: "a" });
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

		await this.finalize();
	}

	async finalize(): Promise<void> {
		if (this.finalizePromise) {
			return this.finalizePromise;
		}

		this.finalizePromise = (async () => {
			if (this.writeStream) {
				await new Promise<void>((resolve, reject) => {
					this.writeStream?.once("finish", resolve);
					this.writeStream?.once("error", reject);
					this.writeStream?.end();
				});
				this.writeStream = null;
			}
		})().finally(() => {
			this.finalizePromise = null;
		});

		return this.finalizePromise;
	}

	isOpen(): boolean {
		return this.writeStream !== null;
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
	}> {
		try {
			const filePath = getHistoryFilePath(this.workspaceId, this.tabId);

			try {
				await fs.access(filePath);
			} catch {
				return { scrollback: "", wasRecovered: false };
			}

			const scrollback = await this.decodeHistory(filePath);

			return {
				scrollback,
				wasRecovered: scrollback.length > 0,
			};
		} catch (error) {
			console.error("Failed to read history:", error);
			return { scrollback: "", wasRecovered: false };
		}
	}

	private async decodeHistory(filePath: string): Promise<string> {
		try {
			let scrollback = "";
			const content = await fs.readFile(filePath, "utf-8");
			const lines = content.split("\n");

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line) as HistoryEvent;

					if (event.type === "data") {
						const data = Buffer.from(event.data, "base64").toString();
						scrollback += data;
					}
				} catch {
					// Skip malformed lines
				}
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
