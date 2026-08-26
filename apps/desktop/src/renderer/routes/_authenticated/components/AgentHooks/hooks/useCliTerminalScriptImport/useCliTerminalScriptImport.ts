import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "../../../../providers/CollectionsProvider";

/**
 * One-shot import of terminal scripts authored by `superset scripts add`. The
 * CLI can only write the legacy local.db store, so it leaves rows flagged for
 * this organization; we copy them into the v2 collection and then clear the
 * flags so a script deleted in v2 is never re-imported.
 */
export function useCliTerminalScriptImport(
	organizationId: string | null,
): void {
	const collections = useCollections();
	const trpcUtils = electronTrpc.useUtils();
	// Each pending id is handled once per mount: the inserts below change
	// v2Presets and re-run the effect before the pending query invalidates.
	const handledIds = useRef(new Set<string>());
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
	const { data: v2Presets = [], isReady: presetsReady } = useLiveQuery(
		(query) => query.from({ presets: collections.v2TerminalPresets }),
		[collections],
	);

	useEffect(() => {
		const pendingScripts = (pendingQuery.data ?? []).filter(
			(script) => !handledIds.current.has(script.id),
		);
		if (!organizationId || !presetsReady || pendingScripts.length === 0) return;

		let nextTabOrder =
			v2Presets.reduce((max, script) => Math.max(max, script.tabOrder), -1) + 1;
		const existingIds = new Set(v2Presets.map((script) => script.id));
		for (const script of pendingScripts) {
			handledIds.current.add(script.id);
			if (existingIds.has(script.id)) continue;
			try {
				collections.v2TerminalPresets.insert({
					id: script.id,
					name: script.name,
					description: script.description,
					cwd: script.cwd,
					commands: script.commands,
					projectIds: script.projectIds ?? null,
					pinnedToBar: script.pinnedToBar,
					useAsWorkspaceRun: script.useAsWorkspaceRun,
					applyOnWorkspaceCreated: script.applyOnWorkspaceCreated,
					applyOnNewTab: script.applyOnNewTab,
					executionMode: script.executionMode ?? "new-tab",
					tabOrder: nextTabOrder++,
					createdAt: new Date(),
				});
			} catch (error) {
				// The row stays in the legacy store either way; skip it rather
				// than let one malformed script take down the layout.
				console.error(
					`[useCliTerminalScriptImport] Skipping script ${script.id}:`,
					error,
				);
			}
		}

		const ids = pendingScripts.map((script) => script.id);
		acknowledge(
			{ organizationId, ids },
			{
				onError: () => {
					for (const id of ids) handledIds.current.delete(id);
				},
			},
		);
	}, [
		acknowledge,
		collections.v2TerminalPresets,
		organizationId,
		pendingQuery.data,
		presetsReady,
		v2Presets,
	]);
}
