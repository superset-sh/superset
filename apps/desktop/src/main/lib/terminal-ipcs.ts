import { type BrowserWindow, ipcMain, shell } from "electron";
import tmuxManager from "./tmux-manager";

export function registerTerminalIPCs(mainWindow: BrowserWindow) {
	// Set main window reference
	tmuxManager.setMainWindow(mainWindow);

	// Initialize tmux manager (restore sessions)
	tmuxManager.initialize().catch((error) => {
		console.error("[Terminal IPC] Failed to initialize tmux manager:", error);
	});

	// Create terminal (or reattach to existing tmux session)
	ipcMain.handle(
		"terminal-create",
		async (
			_event,
			options: { id?: string; cols?: number; rows?: number; cwd?: string },
		) => {
			return await tmuxManager.create(options);
		},
	);

	// Send input to terminal
	ipcMain.on(
		"terminal-input",
		(_event, message: { id: string; data: string }) => {
			tmuxManager.write(message.id, message.data);
		},
	);

	// Resize terminal with sequence tracking
	ipcMain.on(
		"terminal-resize",
		(
			_event,
			message: { id: string; cols: number; rows: number; seq: number },
		) => {
			tmuxManager.resize(message.id, message.cols, message.rows, message.seq);
		},
	);

	// Send signal to terminal foreground process
	ipcMain.on(
		"terminal-signal",
		(_event, message: { id: string; signal: string }) => {
			tmuxManager.signal(message.id, message.signal);
		},
	);

	// Detach from terminal (keep tmux session alive)
	ipcMain.on("terminal-detach", (_event, id: string) => {
		tmuxManager.detach(id);
	});

	// Execute command in terminal
	ipcMain.on(
		"terminal-execute-command",
		(_event, message: { id: string; command: string }) => {
			tmuxManager.executeCommand(message.id, message.command);
		},
	);

	// Kill terminal (destroy tmux session completely)
	ipcMain.on("terminal-kill", (_event, id: string) => {
		tmuxManager.kill(id);
	});

	// Get terminal history
	ipcMain.handle("terminal-get-history", (_event, id: string) => {
		return tmuxManager.getHistory(id);
	});

	// Open external URLs
	ipcMain.handle("open-external", async (_event, url: string) => {
		await shell.openExternal(url);
	});

	// Clean up on app quit
	const cleanup = () => {
		// tmuxManager.killAll();
	};

	return cleanup;
}
