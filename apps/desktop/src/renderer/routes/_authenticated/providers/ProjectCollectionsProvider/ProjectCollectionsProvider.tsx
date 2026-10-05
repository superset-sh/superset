import type { ReactNode } from "react";
import { ProjectCollectionsContext } from "../../hooks/useProjectCollections/useProjectCollections";
import { useProjectCollectionsState } from "../../hooks/useProjectCollections/useProjectCollectionsState";

export function ProjectCollectionsProvider({
	children,
}: {
	children: ReactNode;
}) {
	const value = useProjectCollectionsState();
	return (
		<ProjectCollectionsContext.Provider value={value}>
			{children}
		</ProjectCollectionsContext.Provider>
	);
}
