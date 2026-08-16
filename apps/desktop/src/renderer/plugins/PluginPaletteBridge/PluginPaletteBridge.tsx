import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect } from "react";
import { LuPuzzle } from "react-icons/lu";
import { registerProvider } from "renderer/commandPalette/core/registry";
import type { Command } from "renderer/commandPalette/core/types";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import { useInstalledPlugins } from "../useInstalledPlugins";

function openPluginPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	kind: string,
	pluginId: string,
): void {
	const state = store.getState();
	// One instance per kind: focus the existing pane's tab if it is open.
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind === kind) {
				state.setActiveTab(tab.id);
				return;
			}
		}
	}
	state.addTab({ panes: [{ kind, data: { pluginId } }] });
}

/**
 * Registers plugin-contributed palette commands while a v2 workspace is
 * mounted. One provider per workspace; unregistered on unmount so commands
 * never outlive the surfaces they act on.
 */
export function PluginPaletteBridge({
	workspaceId,
	store,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}) {
	const plugins = useInstalledPlugins();
	const utils = workspaceTrpc.useUtils();
	const collections = useCollections();

	useEffect(() => {
		const commands: Command[] = plugins
			.filter((plugin) => plugin.status === "running")
			.flatMap((plugin) =>
				(plugin.manifest.contributes?.commands ?? []).map(
					(command): Command => {
						const run = command.run;
						return {
							id: `plugin:${plugin.id}:${command.id}`,
							title: command.title,
							section: "actions",
							icon: LuPuzzle,
							keywords: [plugin.name, "plugin"],
							run: () => {
								if (run.type === "action") {
									void utils.client.plugins.invokeAction
										.mutate({
											id: plugin.id,
											action: run.action,
											workspaceId,
										})
										.catch((error) => {
											toast.error(
												`${plugin.name}: ${error instanceof Error ? error.message : String(error)}`,
											);
										});
									return;
								}
								if (run.type === "open-pane") {
									openPluginPane(store, run.kind, plugin.id);
									return;
								}
								const tabId = `plugin:${plugin.id}:${run.tabId}`;
								if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
								collections.v2WorkspaceLocalState.update(
									workspaceId,
									(draft) => {
										draft.sidebarState.activeTab = tabId;
									},
								);
							},
						};
					},
				),
			);
		if (commands.length === 0) return;
		return registerProvider({
			id: `plugins:${workspaceId}`,
			provide: () => commands,
		});
	}, [plugins, workspaceId, utils, collections, store]);

	return null;
}
