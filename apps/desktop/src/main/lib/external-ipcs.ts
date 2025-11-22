import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { ipcMain, shell } from "electron";

const execAsync = promisify(exec);

/**
 * Register external operations IPC handlers
 * These handlers provide access to shell operations like opening URLs
 */
export function registerExternalHandlers() {
	ipcMain.handle("open-external", async (_event, url: string) => {
		await shell.openExternal(url);
	});

	ipcMain.handle(
		"open-file-in-editor",
		async (_event, input: { path: string; line?: number; column?: number }) => {
			let filePath = input.path;

			// Expand home directory
			if (filePath.startsWith("~")) {
				const home = process.env.HOME || process.env.USERPROFILE;
				if (home) {
					filePath = filePath.replace(/^~/, home);
				}
			}

			// Convert to absolute path if relative
			if (!path.isAbsolute(filePath)) {
				filePath = path.resolve(filePath);
			}

			// Try Cursor first, then VSCode, then fall back to system default
			const editors = [
				{ cmd: "cursor", args: "--goto" },
				{ cmd: "code", args: "--goto" },
			];

			// Build the file location string (file:line:column)
			let location = filePath;
			if (input.line) {
				location += `:${input.line}`;
				if (input.column) {
					location += `:${input.column}`;
				}
			}

			// Try each editor in order
			for (const editor of editors) {
				try {
					await execAsync(`${editor.cmd} ${editor.args} "${location}"`);
					return; // Success, exit
				} catch {}
			}

			// If no editor found, open with system default
			await shell.openPath(filePath);
		},
	);

	ipcMain.handle("open-app-settings", async () => {
		// TODO: Implement app settings dialog
		return { success: true };
	});
}
