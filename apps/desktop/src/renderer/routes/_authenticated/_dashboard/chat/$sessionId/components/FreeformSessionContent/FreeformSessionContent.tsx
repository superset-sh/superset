import { Workspace } from "@superset/panes";
import { useCallback, useEffect, useRef } from "react";
import { AddTabMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/AddTabMenu";
import { useDefaultContextMenuActions } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useDefaultPaneActions";
import { usePaneRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry";
import { useV2TerminalLauncher } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2TerminalLauncher";
import { useV2WorkspacePaneLayout } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { FreeformSessionEmptyState } from "../FreeformSessionEmptyState";

const noop = () => {};

/**
 * The tabbed session surface for a freeform (non-workspace) session. Reuses the
 * workspace pane system — terminal + chat tabs — but drops every worktree-bound
 * surface (right sidebar, diff, git status, presets, file navigation).
 */
export function FreeformSessionContent({
	initialChatSessionId,
	initialTab,
}: {
	initialChatSessionId: string;
	initialTab: "chat" | "terminal";
}) {
	const { store } = useV2WorkspacePaneLayout();
	const launcher = useV2TerminalLauncher();

	// Freeform pane layout isn't persisted, so seed the first tab on mount (unless
	// tabs already exist): a terminal for a brand-new session, or a chat bound to
	// the route's session when opening an existing chat.
	const seededRef = useRef(false);
	useEffect(() => {
		if (seededRef.current) return;
		seededRef.current = true;
		if (store.getState().tabs.length > 0) return;
		if (initialTab === "terminal") {
			void launcher.create().then((terminalId) => {
				if (store.getState().tabs.length > 0) return;
				store
					.getState()
					.addTab({ panes: [{ kind: "terminal", data: { terminalId } }] });
			});
			return;
		}
		store.getState().addTab({
			panes: [{ kind: "chat", data: { sessionId: initialChatSessionId } }],
		});
	}, [store, launcher, initialChatSessionId, initialTab]);
	const paneRegistry = usePaneRegistry({
		onOpenFile: noop,
		onRevealPath: noop,
		launcher,
		store,
	});
	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const defaultContextMenuActions = useDefaultContextMenuActions({
		paneRegistry,
		launcher,
	});

	const addTerminalTab = useCallback(async () => {
		const terminalId = await launcher.create();
		store
			.getState()
			.addTab({ panes: [{ kind: "terminal", data: { terminalId } }] });
	}, [launcher, store]);

	const addChatTab = useCallback(() => {
		store
			.getState()
			.addTab({ panes: [{ kind: "chat", data: { sessionId: null } }] });
	}, [store]);

	const addBrowserTab = useCallback(() => {
		store
			.getState()
			.addTab({ panes: [{ kind: "browser", data: { url: "about:blank" } }] });
	}, [store]);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<Workspace<PaneViewerData>
				registry={paneRegistry}
				paneActions={defaultPaneActions}
				contextMenuActions={defaultContextMenuActions}
				renderAddTabMenu={() => (
					<AddTabMenu
						onAddTerminal={addTerminalTab}
						onAddChat={addChatTab}
						onAddBrowser={addBrowserTab}
						showPresetsBar={false}
						onToggleShowPresetsBar={noop}
					/>
				)}
				renderEmptyState={() => (
					<FreeformSessionEmptyState
						onOpenChat={addChatTab}
						onOpenTerminal={addTerminalTab}
					/>
				)}
				store={store}
			/>
		</div>
	);
}
