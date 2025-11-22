import { spawn } from "node:child_process";
import path from "node:path";
import { shell } from "electron";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Spawns a process and waits for it to complete
 * @throws Error if the process exits with non-zero code or fails to spawn
 */
const spawnAsync = (command: string, args: string[]): Promise<void> => {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "ignore",
			detached: false,
		});

		child.on("error", (error) => {
			reject(error);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Process exited with code ${code}`));
			}
		});
	});
};

/**
 * External operations router
 * Handles opening URLs and files in external applications
 */
export const createExternalRouter = () => {
	return router({
		/**
		 * Open a URL in the default browser
		 */
		openUrl: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			await shell.openExternal(input);
		}),

		/**
		 * Open a file in the default editor (Cursor/VSCode)
		 * Supports opening at specific line and column numbers
		 */
		openFileInEditor: publicProcedure
			.input(
				z.object({
					path: z.string(),
					line: z.number().optional(),
					column: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log("[external] openFileInEditor called with:", input);
				let filePath = input.path;

				// Expand home directory - needed because editors expect absolute paths
				if (filePath.startsWith("~")) {
					const home = process.env.HOME || process.env.USERPROFILE;
					if (home) {
						filePath = filePath.replace(/^~/, home);
					}
				}

				// Convert to absolute path - required for editor commands to work reliably
				if (!path.isAbsolute(filePath)) {
					filePath = path.resolve(filePath);
				}

				console.log("[external] Resolved file path:", filePath);

				// Try Cursor first, then VSCode, then fall back to system default
				const editors = ["cursor", "code"];

				// Build the file location string (file:line:column format expected by --goto flag)
				let location = filePath;
				if (input.line) {
					location += `:${input.line}`;
					if (input.column) {
						location += `:${input.column}`;
					}
				}

				console.log("[external] Opening location:", location);

				for (const editor of editors) {
					try {
						console.log(`[external] Trying editor: ${editor}`);
						await spawnAsync(editor, ["--goto", location]);
						console.log(`[external] Successfully opened with ${editor}`);
						return;
					} catch (error) {
						console.log(`[external] ${editor} failed:`, error);
						// Editor not found or failed, try next
					}
				}

				console.log("[external] Falling back to system default");

				// If no editor found, open with system default
				await shell.openPath(filePath);
			}),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
