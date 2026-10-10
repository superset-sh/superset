import type { WorkspaceStore } from "@superset/panes";
import { createContext, useContext } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export interface RightPaneLinkTarget {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	reveal: () => void;
}

const RightPaneLinkTargetContext = createContext<RightPaneLinkTarget | null>(
	null,
);

export function RightPaneLinkTargetProvider({
	value,
	children,
}: {
	value: RightPaneLinkTarget | null;
	children: React.ReactNode;
}) {
	return (
		<RightPaneLinkTargetContext.Provider value={value}>
			{children}
		</RightPaneLinkTargetContext.Provider>
	);
}

export function useRightPaneLinkTarget(): RightPaneLinkTarget | null {
	return useContext(RightPaneLinkTargetContext);
}
