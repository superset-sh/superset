import { appState } from "main/lib/app-state";
import {
	commandSetHash,
	DEFAULT_WORKSPACE_CARD_CONFIG,
	enabledWidgetFiles,
	parseWorkspaceCardConfig,
	type WorkspaceCardConfig,
	workspaceCardTrustHash,
} from "shared/workspace-card-config";
import { readRepoWorkspaceCardBlock } from "./workspace-card-config-read";
import { resolveWorkspaceCardRepoPath } from "./workspace-card-source";
import { readWidgetSources } from "./workspace-card-widgets";

export { commandSetHash };

/**
 * Pure helper: given a repo-sourced config and the stored trust hash for this
 * project (or undefined if never trusted), returns the gated config.
 *
 * Command lines and widget lines are both arbitrary code — they are stripped
 * until the stored hash matches the current hash. Component lines are app code
 * (no shell exec, no LLM-authored source) and always pass through.
 *
 * `currentHash` defaults to the config-only `commandSetHash`. The main process
 * passes the content-aware `workspaceCardTrustHash` instead so editing a widget
 * body (not just its config entry) also re-arms consent.
 *
 * Exported for unit testing without Electron main-process dependencies.
 */
export function applyCommandGating(
	config: WorkspaceCardConfig,
	storedHash: string | undefined,
	currentHash: string = commandSetHash(config),
): WorkspaceCardConfig {
	const trusted = storedHash !== undefined && storedHash === currentHash;
	if (trusted) return config;
	return {
		...config,
		customLines: config.customLines.filter(
			(l) => l.type !== "command" && l.type !== "widget",
		),
	};
}

/**
 * Computes the content-aware trust hash for a project's config by reading the
 * current contents of every enabled widget file. Main-process only (touches the
 * filesystem). Falls back to the config-only hash when the project has no local
 * checkout.
 */
export function resolveWorkspaceCardTrustHash(
	projectId: string,
	config: WorkspaceCardConfig,
): string {
	const repoPath = resolveWorkspaceCardRepoPath(projectId);
	const files = enabledWidgetFiles(config);
	const fileContents = repoPath
		? readWidgetSources(repoPath, files)
		: Object.fromEntries(files.map((f) => [f, null]));
	return workspaceCardTrustHash(config, fileContents);
}

/**
 * Returns true when the project's repo-sourced command/widget lines are trusted
 * for the current command set AND current widget file contents.
 */
export function isCommandSetTrusted(
	projectId: string,
	config: WorkspaceCardConfig,
): boolean {
	const stored = appState.data.trustedCardCommandProjects?.[projectId];
	return (
		stored !== undefined &&
		stored === resolveWorkspaceCardTrustHash(projectId, config)
	);
}

/**
 * The gated config returned to the renderer (and used by card-lines.ts).
 * - When source === "override": user authored it in-app, all lines pass through.
 * - When source === "repo" AND code lines untrusted: command + widget lines
 *   stripped (the widget trust hash also covers widget file contents).
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
	const currentHash = resolveWorkspaceCardTrustHash(projectId, config);
	return applyCommandGating(config, storedHash, currentHash);
}
