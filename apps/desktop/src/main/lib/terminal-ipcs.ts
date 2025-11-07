import { type BrowserWindow, ipcMain, shell } from "electron";
import terminalManager from "./terminal";

export function registerTerminalIPCs(mainWindow: BrowserWindow) {
	// Set main window reference
	terminalManager.setMainWindow(mainWindow);

	// Create terminal
	ipcMain.handle(
		"terminal-create",
		async (
			_event,
			options: { id?: string; cols?: number; rows?: number; cwd?: string },
		) => {
			return await terminalManager.create(options);
		},
	);

	// Send input to terminal
	ipcMain.on(
		"terminal-input",
		(_event, message: { id: string; data: string }) => {
			terminalManager.write(message.id, message.data);
		},
	);

	// Resize terminal
	ipcMain.on(
		"terminal-resize",
		(_event, message: { id: string; cols: number; rows: number }) => {
			terminalManager.resize(message.id, message.cols, message.rows);
		},
	);

	// Execute command in terminal
	ipcMain.on(
		"terminal-execute-command",
		(_event, message: { id: string; command: string }) => {
			terminalManager.executeCommand(message.id, message.command);
		},
	);

	// Kill terminal
	ipcMain.on("terminal-kill", (_event, id: string) => {
		terminalManager.kill(id);
	});

	// Get terminal history
	ipcMain.handle("terminal-get-history", (_event, id: string) => {
		return terminalManager.getHistory(id);
	});

	// Open external URLs
	ipcMain.handle("open-external", async (_event, url: string) => {
		await shell.openExternal(url);
	});

	// Clean up on app quit
	const cleanup = () => {
		terminalManager.cleanup();
	};

	return cleanup;
}
