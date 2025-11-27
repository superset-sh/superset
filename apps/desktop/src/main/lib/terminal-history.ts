import { createWriteStream, promises as fs, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_TEST, SUPERSET_HOME_DIR } from "./app-environment";

export interface SessionMetadata {
	cwd: string;
	cols: number;
	rows: number;
	startedAt: string;
	endedAt?: string;
	exitCode?: number;
}

export function getHistoryDir(workspaceId: string, tabId: string): string {
	const baseDir = IS_TEST
		? join(tmpdir(), "superset-test", ".superset")
		: SUPERSET_HOME_DIR;
	return join(baseDir, "terminal-history", workspaceId, tabId);
}

function getHistoryFilePath(workspaceId: string, tabId: string): string {
	return join(getHistoryDir(workspaceId, tabId), "scrollback.bin");
}

function getMetadataPath(workspaceId: string, tabId: string): string {
	return join(getHistoryDir(workspaceId, tabId), "meta.json");
}

export class HistoryWriter {
	private stream: WriteStream | null = null;
	private filePath: string;
	private metaPath: string;
	private metadata: SessionMetadata;
	private streamErrored = false;

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
		};
	}

	async init(initialScrollback?: string): Promise<void> {
		const dir = getHistoryDir(this.workspaceId, this.tabId);
		await fs.mkdir(dir, { recursive: true });

		// Write initial scrollback (recovered from previous session) or truncate
		if (initialScrollback) {
			await fs.writeFile(this.filePath, Buffer.from(initialScrollback));
		} else {
			await fs.writeFile(this.filePath, Buffer.alloc(0));
		}

		// Open stream in append mode for subsequent writes
		this.stream = createWriteStream(this.filePath, { flags: "a" });
		this.stream.on("error", () => {
			this.streamErrored = true;
			this.stream = null;
		});
	}

	write(data: string): void {
		if (this.stream && !this.streamErrored) {
			try {
				this.stream.write(Buffer.from(data));
			} catch {
				this.streamErrored = true;
			}
		}
	}

	async close(exitCode?: number): Promise<void> {
		if (this.stream && !this.streamErrored) {
			try {
				await new Promise<void>((resolve) => {
					this.stream!.end(() => resolve());
				});
			} catch {
				// Ignore close errors
			}
		}
		this.stream = null;

		this.metadata.endedAt = new Date().toISOString();
		this.metadata.exitCode = exitCode;
		try {
			await fs.writeFile(this.metaPath, JSON.stringify(this.metadata, null, 2));
		} catch {
			// Ignore metadata write errors on shutdown
		}
	}
}

export class HistoryReader {
	constructor(
		private workspaceId: string,
		private tabId: string,
	) {}

	async read(): Promise<{ scrollback: string; metadata?: SessionMetadata }> {
		try {
			const filePath = getHistoryFilePath(this.workspaceId, this.tabId);
			const scrollback = await fs.readFile(filePath, "utf-8");

			let metadata: SessionMetadata | undefined;
			try {
				const metaPath = getMetadataPath(this.workspaceId, this.tabId);
				const metaContent = await fs.readFile(metaPath, "utf-8");
				metadata = JSON.parse(metaContent);
			} catch {
				// Metadata not available
			}

			return { scrollback, metadata };
		} catch {
			return { scrollback: "" };
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
