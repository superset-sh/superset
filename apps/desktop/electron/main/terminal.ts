import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import { db, workspace } from "@superset/db";
import { eq } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import * as pty from "node-pty";

class TerminalManager {
	private static instance: TerminalManager;
	private processes: Map<string, pty.IPty>;
	private outputHistory: Map<string, string>;
	private mainWindow: BrowserWindow | null = null;

	private constructor() {
		this.processes = new Map();
		this.outputHistory = new Map();
	}

	static getInstance(): TerminalManager {
		if (!TerminalManager.instance) {
			TerminalManager.instance = new TerminalManager();
		}
		return TerminalManager.instance;
	}

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	async create(options?: {
		cwd?: string;
		cols?: number;
		rows?: number;
	}): Promise<string> {
		try {
			const id = randomUUID();
			// Use user's configured shell from environment
			const shell =
				os.platform() === "win32"
					? "powershell.exe"
					: process.env.SHELL || "/bin/zsh";

			// Fetch workspace root_dir from database (ID 0)
			let workingDir = options?.cwd;
			if (!workingDir) {
				try {
					const workspaceData = await db
						.select()
						.from(workspace)
						.where(eq(workspace.id, 0))
						.limit(1);

					if (workspaceData.length > 0 && workspaceData[0].rootDir) {
						workingDir = workspaceData[0].rootDir;
					}
				} catch (dbError) {
					console.error("Failed to fetch workspace from database:", dbError);
				}
			}

			// Validate that the directory exists
			if (workingDir && !existsSync(workingDir)) {
				console.warn(
					`Working directory does not exist: ${workingDir}, falling back to HOME or cwd`,
				);
				workingDir = undefined;
			}

			// Fallback to HOME or process.cwd() if no workspace found or directory doesn't exist
			const finalCwd = workingDir || process.env.HOME || process.cwd();

			// Use login shell to load user's shell configuration
			const shellArgs = os.platform() === "win32" ? [] : ["-l"];

			const ptyProcess = pty.spawn(shell, shellArgs, {
				name: "xterm-256color",
				cols: options?.cols || 80,
				rows: options?.rows || 30,
				cwd: finalCwd,
				env: process.env as Record<string, string>,
			});

			ptyProcess.onData((data: string) => {
				this.addTerminalMessage(id, data);
			});

			this.processes.set(id, ptyProcess);
			return id;
		} catch (error) {
			console.error("Failed to create terminal:", error);
			throw error;
		}
	}

	addTerminalMessage(id: string, data: string): void {
		const currentHistory = this.getHistory(id) || "";
		this.outputHistory.set(id, currentHistory + data);
		this.emitMessage(id, data);
	}

	emitMessage(id: string, data: string): void {
		this.mainWindow?.webContents.send("terminal-on-data", {
			id,
			data,
		});
	}

	write(id: string, data: string): boolean {
		try {
			const process = this.processes.get(id);
			if (process) {
				process.write(data);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Failed to write to terminal:", error);
			return false;
		}
	}

	resize(id: string, cols: number, rows: number): boolean {
		try {
			const process = this.processes.get(id);
			if (process) {
				process.resize(cols, rows);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Failed to resize terminal:", error);
			return false;
		}
	}

	kill(id: string): boolean {
		try {
			const process = this.processes.get(id);
			if (process) {
				process.kill();
				this.processes.delete(id);
				this.outputHistory.delete(id);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Failed to kill terminal:", error);
			return false;
		}
	}

	killAll(): boolean {
		try {
			for (const [, process] of this.processes) {
				process.kill();
			}
			this.processes.clear();
			this.outputHistory.clear();
			return true;
		} catch (error) {
			console.error("Failed to kill all terminals:", error);
			return false;
		}
	}

	executeCommand(id: string, command: string): boolean {
		try {
			const newline = os.platform() === "win32" ? "\r\n" : "\n";
			return this.write(id, command + newline);
		} catch (error) {
			console.error("Failed to execute command:", error);
			return false;
		}
	}

	getHistory(id: string): string | undefined {
		return this.outputHistory.get(id);
	}
}

export default TerminalManager.getInstance();
