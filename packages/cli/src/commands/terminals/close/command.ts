import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import type { HostServiceClient } from "../../../lib/host-target";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import { paneLayoutUnavailableReason } from "../../panes/shared";

interface PaneRemoval {
	removedPaneIds: string[];
	skippedPanes: Array<{ paneId: string; reason: string }>;
	failedPanes: Array<{ paneId: string; error: string }>;
	closedOtherTerminalPanes: Array<{
		paneId: string;
		terminalId: string | null;
	}>;
	paneRemovalSkippedReason: string | null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isConflict(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error as { data?: { code?: string } }).data?.code === "CONFLICT"
	);
}

/**
 * Closes every desktop pane showing the terminal. Each close keeps the
 * terminal running; the caller ends it once afterwards, even if a close fails.
 * A pane switched to another terminal since the list is left open.
 */
async function removeTerminalPanes(
	client: HostServiceClient,
	workspaceId: string,
	terminalId: string,
): Promise<PaneRemoval> {
	const removal: PaneRemoval = {
		removedPaneIds: [],
		skippedPanes: [],
		failedPanes: [],
		closedOtherTerminalPanes: [],
		paneRemovalSkippedReason: null,
	};
	let paneIds: string[];
	try {
		const { layout } = await client.panes.list.query({ workspaceId });
		paneIds = layout.tabs
			.flatMap((tab) => tab.panes)
			.filter((pane) => pane.terminalId === terminalId)
			.map((pane) => pane.id);
	} catch (error) {
		const reason = paneLayoutUnavailableReason(error);
		if (!reason) throw error;
		return { ...removal, paneRemovalSkippedReason: reason };
	}
	for (const paneId of paneIds) {
		try {
			const closed = await client.panes.close.mutate({
				workspaceId,
				paneId,
				keepTerminal: true,
				expectedTerminalId: terminalId,
			});
			// Hosts without `expectedTerminalId` ignore it and close anyway.
			if (closed.terminalId !== undefined && closed.terminalId !== terminalId) {
				removal.closedOtherTerminalPanes.push({
					paneId,
					terminalId: closed.terminalId,
				});
				continue;
			}
			removal.removedPaneIds.push(paneId);
		} catch (error) {
			if (isConflict(error)) {
				removal.skippedPanes.push({ paneId, reason: errorMessage(error) });
				continue;
			}
			removal.failedPanes.push({ paneId, error: errorMessage(error) });
		}
	}
	return removal;
}

function describeRemoval(terminalId: string, removal: PaneRemoval): string {
	const lines = [`Closed terminal ${terminalId}`];
	if (removal.paneRemovalSkippedReason) {
		lines[0] += `; panes not removed: ${removal.paneRemovalSkippedReason}`;
	} else if (removal.removedPaneIds.length > 0) {
		const noun = removal.removedPaneIds.length === 1 ? "pane" : "panes";
		lines[0] += ` and removed ${noun} ${removal.removedPaneIds.join(", ")}`;
	} else if (
		removal.failedPanes.length === 0 &&
		removal.skippedPanes.length === 0 &&
		removal.closedOtherTerminalPanes.length === 0
	) {
		lines[0] += "; no pane showed it";
	}
	for (const { paneId, reason } of removal.skippedPanes) {
		lines.push(`Left pane ${paneId} open: ${reason}`);
	}
	for (const { paneId, error } of removal.failedPanes) {
		lines.push(`Warning: could not close pane ${paneId}: ${error}`);
	}
	for (const pane of removal.closedOtherTerminalPanes) {
		const closed = `Warning: closed pane ${pane.paneId}`;
		lines.push(
			pane.terminalId
				? `${closed} while it showed terminal ${pane.terminalId}, not ${terminalId} (the host is too old to check first); ${pane.terminalId} keeps running in the background`
				: `${closed} after it stopped showing ${terminalId} (the host is too old to check first)`,
		);
	}
	return lines.join("\n");
}

export default command({
	description: "Close (dispose) a terminal running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to close"),
		removePane: boolean().desc(
			"Also close the desktop app panes that show the terminal, and their tab when it is left empty",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			options.workspace,
		);

		const removal = options.removePane
			? await removeTerminalPanes(
					target.client,
					options.workspace,
					options.terminal,
				)
			: null;

		const result = await target.client.terminal.killSession.mutate({
			terminalId: options.terminal,
			workspaceId: options.workspace,
		});

		if (!removal) {
			return {
				data: result,
				message: `Closed terminal ${options.terminal}`,
			};
		}
		return {
			data: { ...result, ...removal },
			message: describeRemoval(options.terminal, removal),
		};
	},
});
