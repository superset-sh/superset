import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

type AgentLaunchResult =
	| { ok: true; kind: "terminal"; sessionId: string; label: string }
	| { ok: true; kind: "chat"; sessionId: string; label: string }
	| { ok: false; error: string };

interface AppendArgs {
	existing: WorkspaceState<PaneViewerData> | undefined;
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: AgentLaunchResult[];
}

interface PaneLaunch {
	kind: "terminal" | "chat";
	sessionId: string;
	label?: string;
}

export function appendLaunchesToPaneLayout({
	existing,
	terminals,
	agents,
}: AppendArgs): WorkspaceState<PaneViewerData> {
	const terminalLaunches: PaneLaunch[] = terminals.map((entry) => ({
		kind: "terminal",
		sessionId: entry.terminalId,
		label: entry.label,
	}));
	const agentLaunches: PaneLaunch[] = agents
		.filter((entry): entry is Extract<typeof entry, { ok: true }> => entry.ok)
		.map((entry) => ({
			kind: entry.kind,
			sessionId: entry.sessionId,
			label: entry.label,
		}));
	const launches = [...terminalLaunches, ...agentLaunches];

	if (launches.length === 0) {
		return existing ?? EMPTY_STATE;
	}

	const store = createWorkspaceStore<PaneViewerData>({
		initialState: existing ?? EMPTY_STATE,
	});

	for (const launch of launches) {
		store.getState().addTab({
			titleOverride: launch.label,
			panes: [
				launch.kind === "chat"
					? {
							kind: "chat",
							data: { sessionId: launch.sessionId } satisfies ChatPaneData,
						}
					: {
							kind: "terminal",
							data: {
								terminalId: launch.sessionId,
							} satisfies TerminalPaneData,
						},
			],
		});
	}

	const next = store.getState();
	return {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	};
}
