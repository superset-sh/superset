import { appState } from "main/lib/app-state";
import {
	commandSetHash,
	DEFAULT_WORKSPACE_CARD_CONFIG,
	parseWorkspaceCardConfig,
	type WorkspaceCardConfig,
} from "shared/workspace-card-config";
import { readRepoWorkspaceCardBlock } from "./workspace-card-config-read";

export { commandSetHash };

/**
 * Pure helper: given a repo-sourced config and the stored trust hash for this
 * project (or undefined if never trusted), returns the gated config.
 *
 * - Override source: caller handles separately (not repo-sourced).
 * - Repo source + trusted hash matches: all lines pass through.
 * - Repo source + untrusted: command-type lines stripped; component lines
 *   always pass (they are app code, no shell exec).
 *
 * Exported for unit testing without Electron main-process dependencies.
 */
export function applyCommandGating(
	config: WorkspaceCardConfig,
	storedHash: string | undefined,
): WorkspaceCardConfig {
	const currentHash = commandSetHash(config);
	const trusted = storedHash !== undefined && storedHash === currentHash;
	if (trusted) return config;
	return {
		...config,
		customLines: config.customLines.filter((l) => l.type !== "command"),
	};
}

/**
 * Returns true when the project's repo-sourced command lines are trusted for
 * the current command set.
 */
export function isCommandSetTrusted(
	projectId: string,
	config: WorkspaceCardConfig,
): boolean {
	const stored = appState.data.trustedCardCommandProjects?.[projectId];
	return stored !== undefined && stored === commandSetHash(config);
}

/**
 * The gated config returned to the renderer (and used by card-lines.ts).
 * - When source === "override": user authored it in-app, all lines pass through.
 * - When source === "repo" AND commands untrusted: command-type lines stripped.
 * - When source === "defaults": no custom lines, nothing to strip.
 */
export function resolveGatedWorkspaceCardConfig(
	projectId: string,
): WorkspaceCardConfig {
	const stored = appState.data.workspaceCardConfigs?.[projectId];

	// Override: user authored these in-app; trust all lines.
	if (stored) {
		return parseWorkspaceCardConfig(stored);
	}

	// Repo or defaults path.
	const block = readRepoWorkspaceCardBlock(projectId);
	const config =
		block !== undefined
			? parseWorkspaceCardConfig(block)
			: DEFAULT_WORKSPACE_CARD_CONFIG;

	if (block === undefined) {
		// defaults -- no custom lines anyway
		return config;
	}

	const storedHash = appState.data.trustedCardCommandProjects?.[projectId];
	return applyCommandGating(config, storedHash);
}
