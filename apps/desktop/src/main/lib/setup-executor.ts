import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import type { SetupConfig, SetupResult } from "../../shared/types";

const execAsync = promisify(exec);

/**
 * Reads and parses the setup configuration from .superset/setup.json
 * @param mainRepoPath Path to the main repository
 * @returns Parsed setup config or null if not found
 */
export function readSetupConfig(mainRepoPath: string): SetupConfig | null {
	const configPath = path.join(mainRepoPath, ".superset", "setup.json");

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const config = JSON.parse(content) as SetupConfig;

		// Validate config structure
		if (typeof config !== "object" || config === null) {
			throw new Error("Setup config must be an object");
		}

		if (config.copy && !Array.isArray(config.copy)) {
			throw new Error("'copy' field must be an array of strings");
		}

		if (config.commands && !Array.isArray(config.commands)) {
			throw new Error("'commands' field must be an array of strings");
		}

		return config;
	} catch (error) {
		throw new Error(
			`Failed to parse .superset/setup.json: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Copies files from main repo to worktree based on glob patterns
 * @param mainRepoPath Source directory (main repo)
 * @param worktreePath Destination directory (worktree)
 * @param patterns Array of glob patterns to match files
 * @returns Array of copied file paths and any errors
 */
async function copyFiles(
	mainRepoPath: string,
	worktreePath: string,
	patterns: string[],
): Promise<{ copied: string[]; errors: string[] }> {
	const copied: string[] = [];
	const errors: string[] = [];

	for (const pattern of patterns) {
		try {
			// Use fast-glob to find matching files in main repo
			const matches = await fg(pattern, {
				cwd: mainRepoPath,
				// Include dotfiles
				dot: true,
				// Don't follow symlinks
				followSymbolicLinks: false,
				// Return files only (not directories)
				onlyFiles: true,
			});

			if (matches.length === 0) {
				errors.push(`No files matched pattern: ${pattern}`);
				continue;
			}

			for (const file of matches) {
				const sourcePath = path.join(mainRepoPath, file);
				const destPath = path.join(worktreePath, file);

				try {
					// Create parent directory if it doesn't exist
					const destDir = path.dirname(destPath);
					await mkdir(destDir, { recursive: true });

					// Copy the file
					await copyFile(sourcePath, destPath);
					copied.push(file);
				} catch (copyError) {
					errors.push(
						`Failed to copy ${file}: ${copyError instanceof Error ? copyError.message : String(copyError)}`,
					);
				}
			}
		} catch (globError) {
			errors.push(
				`Failed to process pattern '${pattern}': ${globError instanceof Error ? globError.message : String(globError)}`,
			);
		}
	}

	return { copied, errors };
}

/**
 * Executes shell commands in the worktree directory
 * @param worktreePath Working directory for commands
 * @param commands Array of shell commands to execute
 * @param env Environment variables to pass to commands
 * @returns Combined output and any errors
 */
async function executeCommands(
	worktreePath: string,
	commands: string[],
	env: Record<string, string>,
): Promise<{ output: string; errors: string[] }> {
	const outputs: string[] = [];
	const errors: string[] = [];

	for (const command of commands) {
		try {
			outputs.push(`\n$ ${command}`);

			const { stdout, stderr } = await execAsync(command, {
				cwd: worktreePath,
				env: {
					...process.env,
					...env,
				},
				maxBuffer: 10 * 1024 * 1024, // 10MB buffer
			});

			if (stdout) {
				outputs.push(stdout.trim());
			}
			if (stderr) {
				outputs.push(stderr.trim());
			}
		} catch (execError) {
			const error =
				execError instanceof Error ? execError : new Error(String(execError));
			errors.push(`Command failed: ${command}\n${error.message}`);
			// Include stdout/stderr from failed command if available
			if ("stdout" in error && error.stdout) {
				outputs.push(String(error.stdout));
			}
			if ("stderr" in error && error.stderr) {
				outputs.push(String(error.stderr));
			}
		}
	}

	return { output: outputs.join("\n"), errors };
}

/**
 * Executes the setup script for a newly created worktree
 * @param mainRepoPath Path to the main repository
 * @param worktreePath Path to the newly created worktree
 * @param branch Branch name of the worktree
 * @returns Setup result with output and success status
 */
export async function executeSetup(
	mainRepoPath: string,
	worktreePath: string,
	branch: string,
): Promise<SetupResult> {
	const outputs: string[] = [];
	const allErrors: string[] = [];

	try {
		// Read setup config
		const config = readSetupConfig(mainRepoPath);

		if (!config) {
			return {
				success: true,
				output: "No setup configuration found (.superset/setup.json)",
			};
		}

		outputs.push("🔧 Running setup script...\n");

		// Copy files if specified
		if (config.copy && config.copy.length > 0) {
			outputs.push("📋 Copying files from main repository...");
			const { copied, errors } = await copyFiles(
				mainRepoPath,
				worktreePath,
				config.copy,
			);

			if (copied.length > 0) {
				outputs.push(`✓ Copied ${copied.length} file(s):`);
				for (const file of copied) {
					outputs.push(`  - ${file}`);
				}
			}

			if (errors.length > 0) {
				allErrors.push(...errors);
				outputs.push("\n⚠️  Copy warnings:");
				for (const error of errors) {
					outputs.push(`  - ${error}`);
				}
			}
		}

		// Execute commands if specified
		if (config.commands && config.commands.length > 0) {
			outputs.push("\n📦 Running setup commands...");

			const env = {
				MAIN_REPO_PATH: mainRepoPath,
				WORKTREE_PATH: worktreePath,
				WORKTREE_BRANCH: branch,
			};

			const { output, errors } = await executeCommands(
				worktreePath,
				config.commands,
				env,
			);

			outputs.push(output);

			if (errors.length > 0) {
				allErrors.push(...errors);
			}
		}

		// Determine success based on errors
		const success = allErrors.length === 0;

		if (success) {
			outputs.push("\n✅ Setup complete!");
		} else {
			outputs.push("\n❌ Setup completed with errors:");
			for (const error of allErrors) {
				outputs.push(`  - ${error}`);
			}
		}

		return {
			success,
			output: outputs.join("\n"),
			error: allErrors.length > 0 ? allErrors.join("\n") : undefined,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			output: outputs.join("\n"),
			error: errorMessage,
		};
	}
}
