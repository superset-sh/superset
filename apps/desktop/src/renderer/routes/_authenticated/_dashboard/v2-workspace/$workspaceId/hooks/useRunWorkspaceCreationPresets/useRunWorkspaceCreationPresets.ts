import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { useV2PresetExecution } from "../useV2PresetExecution";

type PresetExecution = ReturnType<typeof useV2PresetExecution>;

/**
 * Resolve a queued id list back to runnable presets. Presets deleted since
 * the create are dropped, as are ones that resolve to no commands (an empty
 * preset would open a bare terminal, which v1 never did either).
 */
export function resolvePendingCreationPresets(
	presetIds: readonly string[],
	getPreset: (id: string) => V2TerminalPresetRow | undefined,
	resolvePresetCommands: (preset: V2TerminalPresetRow) => string[],
): V2TerminalPresetRow[] {
	return presetIds.flatMap((id) => {
		const preset = getPreset(id);
		if (!preset || resolvePresetCommands(preset).length === 0) return [];
		return [preset];
	});
}

/**
 * Run the terminal presets tagged "auto-run on workspace creation" that were
 * queued on this workspace's local-state row when its create resolved (see
 * queueWorkspaceCreationPresets). One-shot: the queue is cleared before the
 * presets run, so a reopen — or a re-render while a run is in flight — can't
 * run them twice. Gated on layout hydration so `executePreset` sees the real
 * pane store (the agent tab the create seeded, or an empty layout it can
 * open a tab into), not the pre-hydration blank.
 */
export function useRunWorkspaceCreationPresets({
	workspaceId,
	isLayoutReady,
	executePreset,
	resolvePresetCommands,
}: {
	workspaceId: string;
	isLayoutReady: boolean;
	executePreset: PresetExecution["executePreset"];
	resolvePresetCommands: PresetExecution["resolvePresetCommands"];
}): void {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const pendingKey = (
		rows.find((row) => row.workspaceId === workspaceId)
			?.pendingCreationPresetIds ?? []
	).join("\n");

	useEffect(() => {
		if (!isLayoutReady || pendingKey === "") return;
		const presetIds = pendingKey.split("\n");

		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.pendingCreationPresetIds = [];
		});

		const presets = resolvePendingCreationPresets(
			presetIds,
			(id) => collections.v2TerminalPresets.get(id),
			resolvePresetCommands,
		);
		void (async () => {
			// Serial so split-pane/sequential presets land in the tab the
			// previous one left active, matching the presets-bar order.
			// executePreset toasts its own failures; the guard keeps an
			// unexpected throw from one script skipping the ones after it.
			for (const preset of presets) {
				try {
					await executePreset(preset);
				} catch (err) {
					console.error("[useRunWorkspaceCreationPresets] preset failed", {
						workspaceId,
						presetId: preset.id,
						err,
					});
				}
			}
		})();
	}, [
		isLayoutReady,
		pendingKey,
		workspaceId,
		collections,
		executePreset,
		resolvePresetCommands,
	]);
}
