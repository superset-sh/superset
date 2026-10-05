import { createContext, type ReactNode, useContext } from "react";
import type {
	ProjectCollectionCommand,
	useProjectCollections,
} from "renderer/routes/_authenticated/hooks/useProjectCollections";

export interface SidebarProjectCollectionsValue
	extends ReturnType<typeof useProjectCollections> {
	run: (command: ProjectCollectionCommand) => Promise<boolean>;
	create: (projectIds?: string[]) => void;
	editingTag: string | null;
	newCollectionTag: string | null;
	setNewCollectionTag: (tag: string | null) => void;
	setEditingTag: (tag: string | null) => void;
}

const Context = createContext<SidebarProjectCollectionsValue | null>(null);

export function DashboardSidebarProjectCollectionsProvider({
	value,
	children,
}: {
	value: SidebarProjectCollectionsValue;
	children: ReactNode;
}) {
	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSidebarProjectCollections() {
	return useContext(Context);
}
