import { spawn } from "node:child_process";
import path from "node:path";
import { clipboard, shell } from "electron";
import { db } from "main/lib/db";
import { EXTERNAL_APPS, type ExternalApp } from "main/lib/db/schemas";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const ExternalAppSchema = z.enum(EXTERNAL_APPS);

/**
 * Get the command and args to open a path in the specified app.
 * Uses `open -a` for macOS apps to avoid PATH issues in production builds.
 */
const getAppCommand = (
	app: ExternalApp,
	targetPath: string,
): { command: string; args: string[] } | null => {
	switch (app) {
		case "finder":
			return null; // Handled specially with shell.showItemInFolder
		case "vscode":
			return {
				command: "open",
				args: ["-a", "Visual Studio Code", targetPath],
			};
		case "cursor":
			return { command: "open", args: ["-a", "Cursor", targetPath] };
		case "xcode":
			return { command: "open", args: ["-a", "Xcode", targetPath] };
		case "iterm":
			return { command: "open", args: ["-a", "iTerm", targetPath] };
		case "warp":
			return { command: "open", args: ["-a", "Warp", targetPath] };
		case "terminal":
			return { command: "open", args: ["-a", "Terminal", targetPath] };
		case "sublime":
			return { command: "open", args: ["-a", "Sublime Text", targetPath] };
		// JetBrains IDEs
		case "intellij":
			return { command: "open", args: ["-a", "IntelliJ IDEA", targetPath] };
		case "webstorm":
			return { command: "open", args: ["-a", "WebStorm", targetPath] };
		case "pycharm":
			return { command: "open", args: ["-a", "PyCharm", targetPath] };
		case "phpstorm":
			return { command: "open", args: ["-a", "PhpStorm", targetPath] };
		case "rubymine":
			return { command: "open", args: ["-a", "RubyMine", targetPath] };
		case "goland":
			return { command: "open", args: ["-a", "GoLand", targetPath] };
		case "clion":
			return { command: "open", args: ["-a", "CLion", targetPath] };
		case "rider":
			return { command: "open", args: ["-a", "Rider", targetPath] };
		case "datagrip":
			return { command: "open", args: ["-a", "DataGrip", targetPath] };
		case "appcode":
			return { command: "open", args: ["-a", "AppCode", targetPath] };
		case "fleet":
			return { command: "open", args: ["-a", "Fleet", targetPath] };
		case "rustrover":
			return { command: "open", args: ["-a", "RustRover", targetPath] };
		default:
			return null;
	}
};

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
			reject(
				new Error(
					`Failed to spawn '${command}': ${error.message}. Ensure the application is installed.`,
				),
			);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`'${command}' exited with code ${code}. The application may not be installed.`,
					),
				);
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
		openUrl: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			await shell.openExternal(input);
		}),

		openInFinder: publicProcedure
			.input(z.string())
			.mutation(async ({ input }) => {
				shell.showItemInFolder(input);
			}),

		openInApp: publicProcedure
			.input(
				z.object({
					path: z.string(),
					app: ExternalAppSchema,
				}),
			)
			.mutation(async ({ input }) => {
				// Save last used app to DB
				await db.update((data) => {
					data.settings.lastUsedApp = input.app;
				});

				if (input.app === "finder") {
					shell.showItemInFolder(input.path);
					return;
				}

				const cmd = getAppCommand(input.app, input.path);
				if (!cmd) {
					throw new Error(`Unknown app: ${input.app}`);
				}

				await spawnAsync(cmd.command, cmd.args);
			}),

		copyPath: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			clipboard.writeText(input);
		}),

		openFileInEditor: publicProcedure
			.input(
				z.object({
					path: z.string(),
					line: z.number().optional(),
					column: z.number().optional(),
					cwd: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
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
					filePath = input.cwd
						? path.resolve(input.cwd, filePath)
						: path.resolve(filePath);
				}

				// Build the file location string (file:line:column format for URL schemes)
				let location = filePath;
				if (input.line) {
					location += `:${input.line}`;
					if (input.column) {
						location += `:${input.column}`;
					}
				}

				// Try editor URL schemes - these work reliably without PATH issues
				// Format: cursor://file/path:line:column or vscode://file/path:line:column
				const editorSchemes = ["cursor", "vscode"];

				for (const scheme of editorSchemes) {
					try {
						const url = `${scheme}://file${location}`;
						await shell.openExternal(url);
						return;
					} catch {
						// Editor not installed or URL scheme not registered, try next
					}
				}

				// Fall back to system default
				await shell.openPath(filePath);
			}),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
