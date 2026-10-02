import { createContext, type ReactNode, useContext } from "react";

const WindowChromeScopeContext = createContext(true);

/** Marks a pane that is not the leftmost on screen, so its header leaves the window controls to another. */
export function WindowChromeScope({
	enabled,
	children,
}: {
	enabled: boolean;
	children: ReactNode;
}) {
	return (
		<WindowChromeScopeContext.Provider value={enabled}>
			{children}
		</WindowChromeScopeContext.Provider>
	);
}

export function useWindowChromeEnabled(): boolean {
	return useContext(WindowChromeScopeContext);
}
