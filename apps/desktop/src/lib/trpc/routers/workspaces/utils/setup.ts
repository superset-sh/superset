import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import fg from "fast-glob";
import type { SetupConfig } from "shared/types";

export function loadSetupConfig(mainRepoPath: string): SetupConfig | null {
	const configPath = join(mainRepoPath, ".superset", "setup.json");

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as SetupConfig;

		if (parsed.copy && !Array.isArray(parsed.copy)) {
			throw new Error("'copy' field must be an array of strings");
		}

		if (parsed.commands && !Array.isArray(parsed.commands)) {
			throw new Error("'commands' field must be an array of strings");
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

export async function copySetupFiles(
	mainRepoPath: string,
	worktreePath: string,
	patterns: string[],
): Promise<{ copied: string[]; errors: string[] }> {
	const copied: string[] = [];
	const errors: string[] = [];

	for (const pattern of patterns) {
		try {
			const matches = await fg(pattern, {
				cwd: mainRepoPath,
				dot: true,
				followSymbolicLinks: false,
				onlyFiles: true,
				ignore: [".superset/**"],
			});

			if (matches.length === 0) {
				errors.push(`No files matched pattern: ${pattern}`);
				continue;
			}

			for (const relativePath of matches) {
				const sourcePath = join(mainRepoPath, relativePath);
				const destinationPath = join(worktreePath, relativePath);

				try {
					await mkdir(dirname(destinationPath), { recursive: true });
					await copyFile(sourcePath, destinationPath);
					copied.push(relativePath);
				} catch (copyError) {
					errors.push(
						`Failed to copy ${relativePath}: ${copyError instanceof Error ? copyError.message : String(copyError)}`,
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
