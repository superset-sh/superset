import { createContext, useContext } from "react";
import type { PaneTarget } from "../../types";

export type RightPaneLinkTarget = PaneTarget;

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
