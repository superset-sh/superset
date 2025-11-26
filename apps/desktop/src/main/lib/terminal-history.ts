import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export interface SessionMetadata {
	cwd: string;
	cols: number;
	rows: number;
	startedAt: string;
	endedAt?: string;
	exitCode?: number;
}

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

function getHistoryFilePath(workspaceId: string, tabId: string): string {
	return join(getHistoryDir(workspaceId, tabId), "scrollback.txt");
}

function getMetadataPath(workspaceId: string, tabId: string): string {
	return join(getHistoryDir(workspaceId, tabId), "meta.json");
}

export class HistoryWriter {
	private metadata: SessionMetadata;

	constructor(
		private workspaceId: string,
		private tabId: string,
		cwd: string,
		cols: number,
		rows: number,
	) {
		this.metadata = {
			cwd,
			cols,
			rows,
			startedAt: new Date().toISOString(),
		};
	}

	async write(scrollback: string, exitCode?: number): Promise<void> {
		const dir = getHistoryDir(this.workspaceId, this.tabId);
		await fs.mkdir(dir, { recursive: true });

		const filePath = getHistoryFilePath(this.workspaceId, this.tabId);
		await fs.writeFile(filePath, scrollback);

		this.metadata.endedAt = new Date().toISOString();
		this.metadata.exitCode = exitCode;

		const metaPath = getMetadataPath(this.workspaceId, this.tabId);
		await fs.writeFile(metaPath, JSON.stringify(this.metadata, null, 2));
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
