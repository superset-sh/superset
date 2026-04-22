import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

interface DeletingWorkspacesContextValue {
	isDeleting: (workspaceId: string) => boolean;
	markDeleting: (workspaceId: string) => void;
	clearDeleting: (workspaceId: string) => void;
}

const DeletingWorkspacesContext =
	createContext<DeletingWorkspacesContextValue | null>(null);

/**
 * Tracks workspaces whose `workspaceCleanup.destroy` call is in flight.
 * The sidebar hides these rows optimistically so users get instant feedback
 * instead of watching the row sit there during the 10–20s destroy window.
 * On error the caller calls `clearDeleting` and the row reappears; on
 * success the row is naturally unmounted via `v2WorkspaceLocalState.delete`.
 */
export function DeletingWorkspacesProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

	const isDeleting = useCallback(
		(workspaceId: string) => ids.has(workspaceId),
		[ids],
	);

	const markDeleting = useCallback((workspaceId: string) => {
		setIds((prev) => {
			if (prev.has(workspaceId)) return prev;
			const next = new Set(prev);
			next.add(workspaceId);
			return next;
		});
	}, []);

	const clearDeleting = useCallback((workspaceId: string) => {
		setIds((prev) => {
			if (!prev.has(workspaceId)) return prev;
			const next = new Set(prev);
			next.delete(workspaceId);
			return next;
		});
	}, []);

	const value = useMemo(
		() => ({ isDeleting, markDeleting, clearDeleting }),
		[isDeleting, markDeleting, clearDeleting],
	);

	return (
		<DeletingWorkspacesContext.Provider value={value}>
			{children}
		</DeletingWorkspacesContext.Provider>
	);
}

export function useDeletingWorkspaces() {
	const ctx = useContext(DeletingWorkspacesContext);
	if (!ctx) {
		throw new Error(
			"useDeletingWorkspaces must be used within DeletingWorkspacesProvider",
		);
	}
	return ctx;
}
