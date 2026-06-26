import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkspaceCardRepoPath } from "./workspace-card-source";

function getConfigPath(repoPath: string): string {
	return join(repoPath, ".superset", "config.json");
}

function readProjectConfigFile(configPath: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Missing or invalid file -- caller falls back to defaults.
	}
	return {};
}

/**
 * The raw "workspaceCard" block of the project's .superset/config.json, or
 * undefined when the project has no local repo path or the file lacks the
 * block. Shared between config.ts and workspace-card-trust.ts to avoid
 * circular imports.
 */
export function readRepoWorkspaceCardBlock(projectId: string): unknown {
	const repoPath = resolveWorkspaceCardRepoPath(projectId);
	if (!repoPath) return undefined;
	return readProjectConfigFile(getConfigPath(repoPath)).workspaceCard;
}
