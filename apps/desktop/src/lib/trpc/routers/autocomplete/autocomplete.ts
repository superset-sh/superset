import fs from "node:fs/promises";
import path from "node:path";
import { commandHistoryManager } from "main/lib/command-history";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Autocomplete router for command history and file completion
 *
 * Provides:
 * - Command history search with fuzzy matching
 * - Recent command matching for ghost text suggestions
 * - File/directory listing for path completion
 */
export const createAutocompleteRouter = () => {
	return router({
		/**
		 * Search command history with fuzzy matching
		 * Uses FTS5 for efficient search across all recorded commands
		 */
		searchHistory: publicProcedure
			.input(
				z.object({
					query: z.string(),
					limit: z.number().default(50),
					workspaceId: z.string().optional(),
				}),
			)
			.query(({ input }) => {
				return commandHistoryManager.search({
					query: input.query,
					limit: input.limit,
					workspaceId: input.workspaceId,
				});
			}),

		/**
		 * Get the most recent command matching a prefix
		 * Used for inline ghost text suggestions (Fish-style autosuggestions)
		 */
		getRecentMatch: publicProcedure
			.input(
				z.object({
					prefix: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.query(({ input }) => {
				return commandHistoryManager.getRecentMatch({
					prefix: input.prefix,
					workspaceId: input.workspaceId,
				});
			}),

		/**
		 * Record a command execution
		 * Called when shell emits OSC 133 sequences
		 */
		recordCommand: publicProcedure
			.input(
				z.object({
					command: z.string(),
					workspaceId: z.string().optional(),
					cwd: z.string().optional(),
					exitCode: z.number().optional(),
				}),
			)
			.mutation(({ input }) => {
				commandHistoryManager.record({
					command: input.command,
					workspaceId: input.workspaceId,
					cwd: input.cwd,
					exitCode: input.exitCode,
				});
			}),

		/**
		 * Get recent commands (no search query)
		 * Used for initial history picker display
		 */
		getRecent: publicProcedure
			.input(
				z.object({
					limit: z.number().default(50),
					workspaceId: z.string().optional(),
				}),
			)
			.query(({ input }) => {
				return commandHistoryManager.getRecent({
					limit: input.limit,
					workspaceId: input.workspaceId,
				});
			}),

		/**
		 * List files and directories for path completion
		 * Supports partial path matching (e.g., "src/comp" matches "src/components/")
		 */
		listCompletions: publicProcedure
			.input(
				z.object({
					partial: z.string(),
					cwd: z.string(),
					showHidden: z.boolean().default(false),
					type: z.enum(["all", "files", "directories"]).default("all"),
				}),
			)
			.query(async ({ input }) => {
				const { partial, cwd, showHidden, type } = input;

				try {
					// Resolve the partial path
					const isAbsolute = path.isAbsolute(partial);
					const basePath = isAbsolute ? partial : path.join(cwd, partial);

					// Check if partial ends with separator (user is in directory)
					const _endsWithSep =
						partial.endsWith("/") || partial.endsWith(path.sep);

					// Get directory and prefix for filtering
					let dirPath: string;
					let prefix: string;

					try {
						const stat = await fs.stat(basePath);
						if (stat.isDirectory()) {
							dirPath = basePath;
							prefix = "";
						} else {
							dirPath = path.dirname(basePath);
							prefix = path.basename(basePath);
						}
					} catch {
						// Path doesn't exist, treat as partial
						dirPath = path.dirname(basePath);
						prefix = path.basename(basePath);
					}

					// Read directory
					const entries = await fs.readdir(dirPath, { withFileTypes: true });

					// Filter and map entries
					const completions = entries
						.filter((entry) => {
							// Filter by prefix
							if (
								prefix &&
								!entry.name.toLowerCase().startsWith(prefix.toLowerCase())
							) {
								return false;
							}

							// Filter hidden files
							if (!showHidden && entry.name.startsWith(".")) {
								return false;
							}

							// Filter by type
							if (type === "files" && entry.isDirectory()) {
								return false;
							}
							if (type === "directories" && !entry.isDirectory()) {
								return false;
							}

							return true;
						})
						.map((entry) => {
							const isDirectory = entry.isDirectory();
							const name = entry.name;
							const fullPath = path.join(dirPath, name);

							// Build the completion text (what to insert)
							// If user typed "src/comp", completion for "components" should be "onents/"
							const completionSuffix = isDirectory ? "/" : "";
							const insertText = name.slice(prefix.length) + completionSuffix;

							return {
								name,
								insertText,
								fullPath,
								isDirectory,
								icon: isDirectory ? "folder" : getFileIcon(name),
							};
						})
						.sort((a, b) => {
							// Directories first, then alphabetical
							if (a.isDirectory && !b.isDirectory) return -1;
							if (!a.isDirectory && b.isDirectory) return 1;
							return a.name.localeCompare(b.name);
						})
						.slice(0, 50); // Limit results

					return {
						basePath: dirPath,
						prefix,
						completions,
					};
				} catch (error) {
					return {
						basePath: cwd,
						prefix: partial,
						completions: [],
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			}),
	});
};

/**
 * Get a simple icon identifier based on file extension
 */
function getFileIcon(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	const iconMap: Record<string, string> = {
		".ts": "typescript",
		".tsx": "react",
		".js": "javascript",
		".jsx": "react",
		".json": "json",
		".md": "markdown",
		".css": "css",
		".scss": "css",
		".html": "html",
		".py": "python",
		".rs": "rust",
		".go": "go",
		".sh": "shell",
		".bash": "shell",
		".zsh": "shell",
		".yml": "yaml",
		".yaml": "yaml",
		".toml": "config",
		".env": "config",
		".gitignore": "git",
		".git": "git",
	};
	return iconMap[ext] || "file";
}
