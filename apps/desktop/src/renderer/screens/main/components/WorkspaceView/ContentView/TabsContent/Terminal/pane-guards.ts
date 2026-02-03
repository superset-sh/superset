import type { Pane } from "shared/tabs-types";

export const isPaneDestroyed = (
	panes: Record<string, Pane> | undefined,
	paneId: string,
): boolean => !panes?.[paneId];
