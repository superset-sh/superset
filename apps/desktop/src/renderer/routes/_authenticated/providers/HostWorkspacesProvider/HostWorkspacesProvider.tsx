import { createContext, type ReactNode, useContext } from "react";
import {
	type UseHostWorkspacesResult,
	useHostWorkspacesSource,
} from "renderer/hooks/host-workspaces/useHostWorkspaces";

const HostWorkspacesContext = createContext<UseHostWorkspacesResult | null>(
	null,
);

/**
 * Runs the per-host workspace fan-out once (queries, event subscriptions,
 * IndexedDB snapshots) and shares the merged result — consumers must not
 * call the source hook unscoped or every call site would duplicate the
 * fan-out; single-host scoped calls are fine (they share query keys).
 */
export function HostWorkspacesProvider({ children }: { children: ReactNode }) {
	const value = useHostWorkspacesSource();
	return (
		<HostWorkspacesContext.Provider value={value}>
			{children}
		</HostWorkspacesContext.Provider>
	);
}

/**
 * The workspace read path: every known host's workspaces, merged — the
 * local host serves live even offline; a remote host contributes nothing
 * until it answers.
 */
export function useHostWorkspaces(): UseHostWorkspacesResult {
	const value = useContext(HostWorkspacesContext);
	if (!value) {
		throw new Error(
			"useHostWorkspaces must be used within HostWorkspacesProvider",
		);
	}
	return value;
}
