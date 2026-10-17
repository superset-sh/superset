import { useLingui } from "@lingui/react/macro";
import {
	type ContextMenuActionConfig,
	transferPaneToNewTab,
	type WorkspaceStore,
} from "@superset/panes";
import { useMemo } from "react";
import { LuArrowRightToLine } from "react-icons/lu";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function usePaneAreaMoveActions({
	defaults,
	enabled,
	source,
	target,
	onMoved,
}: {
	defaults: ContextMenuActionConfig<PaneViewerData>[];
	enabled: boolean;
	source: StoreApi<WorkspaceStore<PaneViewerData>>;
	target: StoreApi<WorkspaceStore<PaneViewerData>>;
	onMoved?: () => void;
}): ContextMenuActionConfig<PaneViewerData>[] {
	const { t } = useLingui();
	return useMemo(() => {
		if (!enabled) return defaults;
		return [
			...defaults,
			{ key: "pane-area-move-separator", type: "separator" },
			{
				key: "pane-area-move",
				label: t({ message: "Move to Right Side" }),
				icon: <LuArrowRightToLine />,
				onSelect: (ctx) => {
					transferPaneToNewTab({ source, target, paneId: ctx.pane.id });
					onMoved?.();
				},
			},
		];
	}, [defaults, enabled, source, target, onMoved, t]);
}
