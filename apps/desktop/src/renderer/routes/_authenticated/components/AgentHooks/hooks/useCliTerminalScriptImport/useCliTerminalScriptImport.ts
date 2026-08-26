import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { buildV2TerminalPresetRow } from "renderer/lib/v1-migration";
import { getNextTabOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useCollections } from "../../../../providers/CollectionsProvider";

/**
 * One-shot import of terminal scripts authored by `superset scripts add`. The
 * CLI can only write the legacy local.db store, so it leaves rows flagged for
 * this organization; we copy them into the v2 collection and then clear the
 * flags so a script deleted in v2 is never re-imported. A script whose insert
 * fails is NOT acknowledged: its marker survives, and the next refetch of the
 * pending query (focus, /settings-changed nudge) retries it.
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
		// serve a rare one-shot import.
		const v2Presets = [...collections.v2TerminalPresets.state.values()];
		const existingIds = new Set(v2Presets.map((preset) => preset.id));
		let tabOrder = getNextTabOrder(v2Presets);
		const importedIds: string[] = [];
		for (const script of pendingScripts) {
			if (existingIds.has(script.id)) {
				importedIds.push(script.id);
				continue;
			}
			try {
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
				importedIds.push(script.id);
			} catch (error) {
				console.error(
					`[useCliTerminalScriptImport] Import failed for ${script.id}:`,
					error,
				);
			}
		}

		if (importedIds.length > 0)
			acknowledge({ organizationId, ids: importedIds });
	}, [
		acknowledge,
		collections.v2TerminalPresets,
		organizationId,
		pendingQuery.data,
	]);
}
