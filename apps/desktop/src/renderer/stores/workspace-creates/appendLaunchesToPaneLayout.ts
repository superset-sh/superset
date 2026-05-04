import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

interface AppendArgs {
	existing: WorkspaceState<PaneViewerData> | undefined;
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: Array<
		| { ok: true; sessionId: string; label: string }
		| { ok: false; error: string }
	>;
}

export function appendLaunchesToPaneLayout({
	existing,
	terminals,
	agents,
}: AppendArgs): WorkspaceState<PaneViewerData> {
	const launches = [
		...terminals,
		...agents
			.filter((entry): entry is Extract<typeof entry, { ok: true }> => entry.ok)
			.map((entry) => ({ terminalId: entry.sessionId, label: entry.label })),
	];

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
				{
					kind: "terminal",
					data: { terminalId: launch.terminalId },
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
