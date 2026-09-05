import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { buildV2TerminalPresetRow } from "renderer/lib/v1-migration";
import { getNextTabOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useCollections } from "../../../../providers/CollectionsProvider";
import { applyCliTerminalScriptEdit } from "./applyCliTerminalScriptEdit";

/**
 * One-shot sync of terminal scripts changed by `superset scripts add|edit|
 * delete`. The CLI can only write the legacy local.db store, so it leaves
 * rows flagged for this organization: new scripts are copied into the v2
 * collection, edited ones update their v2 row in place, and delete
 * tombstones remove the v2 row. The flags are then cleared so a script
 * deleted in v2 is never re-imported. A script whose write fails is NOT
 * acknowledged: its marker survives, and the next refetch of the pending
 * query (focus, /settings-changed nudge) retries it.
 */
export function useCliTerminalScriptImport(
	organizationId: string | null,
): void {
	const collections = useCollections();
	const trpcUtils = electronTrpc.useUtils();
	const pendingQuery =
		electronTrpc.settings.getPendingCliTerminalScripts.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: !!organizationId },
		);
	const { mutate: acknowledge } =
		electronTrpc.settings.acknowledgeCliTerminalScripts.useMutation({
			onSuccess: () =>
				organizationId
					? trpcUtils.settings.getPendingCliTerminalScripts.invalidate({
							organizationId,
						})
					: undefined,
		});

	useEffect(() => {
		const pendingScripts = pendingQuery.data ?? [];
		if (!organizationId || pendingScripts.length === 0) return;

		// Non-reactive snapshot: localStorage collections hydrate at
		// construction, and reading `.state` imperatively keeps this
		// app-lifetime hook from subscribing to every preset change just to
		// serve a rare one-shot sync.
		const v2Presets = [...collections.v2TerminalPresets.state.values()];
		const existingIds = new Set(v2Presets.map((preset) => preset.id));
		let tabOrder = getNextTabOrder(v2Presets);
		const appliedIds: string[] = [];
		for (const script of pendingScripts) {
			try {
				if (script.cliDeletePending) {
					if (existingIds.has(script.id))
						collections.v2TerminalPresets.delete(script.id);
				} else if (existingIds.has(script.id)) {
					collections.v2TerminalPresets.update(script.id, (draft) =>
						applyCliTerminalScriptEdit(draft, script),
					);
				} else {
					collections.v2TerminalPresets.insert(
						// No agent resolution: the user's explicit command must not be
						// swapped for a live agent launch command.
						buildV2TerminalPresetRow(
							script,
							tabOrder++,
							{ v2Name: script.name, linkedAgentId: undefined },
							{ id: script.id, useAsWorkspaceRun: script.useAsWorkspaceRun },
						),
					);
				}
				appliedIds.push(script.id);
			} catch (error) {
				console.error(
					`[useCliTerminalScriptImport] Sync failed for ${script.id}:`,
					error,
				);
			}
		}

		if (appliedIds.length > 0) acknowledge({ organizationId, ids: appliedIds });
	}, [
		acknowledge,
		collections.v2TerminalPresets,
		organizationId,
		pendingQuery.data,
	]);
}
