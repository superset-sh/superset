import { createContext, useContext } from "react";
import type { useProjectCollectionsState } from "./useProjectCollectionsState";

export const ProjectCollectionsContext = createContext<ReturnType<
	typeof useProjectCollectionsState
> | null>(null);

export function useProjectCollections() {
	const value = useContext(ProjectCollectionsContext);
	if (!value)
		throw new Error(
			"useProjectCollections requires ProjectCollectionsProvider",
		);
	return value;
}
