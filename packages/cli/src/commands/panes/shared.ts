import { CLIError, string } from "@superset/cli-framework";
import type {
	PaneLayoutNode,
	PaneLayoutOpResult,
	PaneLayoutSnapshot,
	PaneLayoutTab,
} from "@superset/shared/pane-layout-ops";
import { PANE_SPLIT_DIRECTIONS } from "@superset/shared/pane-layout-ops";
import type { HostServiceClient } from "../../lib/host-target";

export const workspaceOptions = {
	workspace: string().required().desc("Workspace ID"),
	host: string().desc("Host the workspace lives on (default: this machine)"),
};

export const directionOption = () =>
	string()
		.enum(...PANE_SPLIT_DIRECTIONS)
		.desc("Side to place the pane on: right, left, down, or up");

/** Turns a host without the `panes` router into an actionable error. */
export async function callPanes<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		if (
			error instanceof Error &&
			/No procedure found on path "?panes\./.test(error.message)
		) {
			throw new CLIError(
				"This host is too old for `superset panes`",
				"Update the Superset desktop app on that host",
			);
		}
		throw error;
	}
}

export const terminalOptions = {
	terminal: string().desc("Existing terminal session to show in the new pane"),
	command: string().desc("Command to run in the new terminal"),
};

/**
 * Runs `place` with `terminal`, or with a terminal created for it. A created
 * terminal is killed if placing it fails, so no orphan session is left.
 */
export async function withPaneTerminal<T>(
	client: HostServiceClient,
	workspaceId: string,
	options: { terminal?: string | null; command?: string | null },
	place: (terminalId: string) => Promise<T>,
): Promise<T & { terminalId: string }> {
	if (options.terminal && options.command) {
		throw new CLIError(
			"--command only applies to a new terminal",
			"Drop --terminal to create one, or drop --command",
		);
	}
	const terminalId =
		options.terminal ??
		(
			await client.terminal.createSession.mutate({
				workspaceId,
				initialCommand: options.command ?? undefined,
			})
		).terminalId;
	try {
		return { ...(await callPanes(() => place(terminalId))), terminalId };
	} catch (error) {
		if (!options.terminal) {
			await client.terminal.killSession
				.mutate({ workspaceId, terminalId })
				.catch(() => {});
		}
		throw error;
	}
}

function describePane(pane: PaneLayoutTab["panes"][number]): string {
	const title = pane.terminalTitle ?? pane.title;
	const agent = pane.agent ? `${pane.agent.id} · ${pane.agent.state}` : null;
	return [
		pane.id,
		pane.kind,
		title ? `"${title}"` : null,
		agent,
		pane.terminalId ? `terminal ${pane.terminalId}` : null,
		pane.active ? "(active)" : null,
	]
		.filter(Boolean)
		.join("  ");
}

function formatNode(
	node: PaneLayoutNode,
	tab: PaneLayoutTab,
	depth: number,
): string[] {
	const indent = "  ".repeat(depth);
	if (node.type === "split") {
		const first = Math.round(node.ratio * 100);
		return [
			`${indent}${node.direction} ${first}/${100 - first}`,
			...formatNode(node.first, tab, depth + 1),
			...formatNode(node.second, tab, depth + 1),
		];
	}
	const pane = tab.panes.find((candidate) => candidate.id === node.paneId);
	return [`${indent}${pane ? describePane(pane) : node.paneId}`];
}

export function formatLayout(layout: PaneLayoutSnapshot): string {
	if (layout.tabs.length === 0) return "No panes open in this workspace.";
	return layout.tabs
		.flatMap((tab) => [
			[`tab ${tab.id}`, tab.title ?? "", tab.active ? "(active)" : ""]
				.filter(Boolean)
				.join("\t"),
			...formatNode(tab.layout, tab, 1),
		])
		.join("\n");
}

export function layoutResult<T extends PaneLayoutOpResult>(
	summary: string,
	result: T,
) {
	return {
		data: result,
		message: `${summary}\n${formatLayout(result.layout)}`,
	};
}
