import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const execAsync = promisify(exec);

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
			}),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
