import { track } from "renderer/lib/analytics";
import type { electronTrpc } from "renderer/lib/electron-trpc";

type ElectronTrpcUtils = ReturnType<typeof electronTrpc.useUtils>;

export async function invalidateProjectScriptQueries(
	utils: ElectronTrpcUtils,
	projectId: string,
): Promise<void> {
	await Promise.all([
		utils.config.getConfigContent.invalidate({ projectId }),
		utils.config.shouldShowSetupCard.invalidate({ projectId }),
		utils.workspaces.getWorkspaceRunDefinition.invalidate(),
		utils.workspaces.getResolvedRunCommands.invalidate(),
	]);
}

const SCRIPT_KINDS = ["setup", "teardown", "run"] as const;

/**
 * Count configured commands consistently across surfaces. Some editors persist
 * each command as its own array element (line-split), while others store the
 * whole textarea as a single multi-line element — so we count non-empty lines
 * across all elements rather than the raw array length.
 */
function countCommands(commands: string[] | undefined): number {
	return (commands ?? [])
		.flatMap((command) => command.split("\n"))
		.filter((line) => line.trim().length > 0).length;
}

/**
 * Fire a PostHog event when a user saves a project setup/teardown/run script.
 * Called from every updateConfig save site (v1 settings, v2 settings, and the
 * save-and-create-workspace flow) so setup-script adoption is tracked across
 * all surfaces from one place.
 *
 * Only emits metrics for the script kinds the caller actually passed — a
 * surface that doesn't edit `run` (e.g. save-and-create-workspace) omits the
 * run_* properties instead of misreporting `has_run: false`.
 *
 * Never throws: analytics is non-critical and must not break the save path it
 * is called from.
 */
export function trackSetupScriptConfigured(input: {
	projectId: string;
	setup?: string[];
	teardown?: string[];
	run?: string[];
}): void {
	try {
		const properties: Record<string, unknown> = {
			project_id: input.projectId,
		};
		for (const kind of SCRIPT_KINDS) {
			if (input[kind] === undefined) continue;
			const count = countCommands(input[kind]);
			properties[`${kind}_command_count`] = count;
			properties[`has_${kind}`] = count > 0;
		}
		track("setup_script_configured", properties);
	} catch (error) {
		console.error(
			"[analytics] Failed to track setup_script_configured:",
			error,
		);
	}
}
