import type { CloudWorkspaceSort } from "@superset/shared/cloud-workspace-groups";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const LIST_DISPLAY_STORAGE_KEY = "list-display";

export type CloudWorkspaceGrouping = "time" | "person" | "none";

export type ProjectSort = "status" | "name" | "target" | "created";

interface ListDisplayState {
	cloudWorkspaces: {
		sort: CloudWorkspaceSort;
		groupBy: CloudWorkspaceGrouping;
	};
	projects: { sort: ProjectSort };
	setCloudWorkspacesDisplay: (
		patch: Partial<ListDisplayState["cloudWorkspaces"]>,
	) => void;
	setProjectsDisplay: (patch: Partial<ListDisplayState["projects"]>) => void;
}

/** How each list page is displayed; a fixed-size singleton per profile. */
export const useListDisplayStore = create<ListDisplayState>()(
	persist(
		(set) => ({
			cloudWorkspaces: { sort: "activity", groupBy: "time" },
			projects: { sort: "status" },
			setCloudWorkspacesDisplay: (patch) =>
				set((state) => ({
					cloudWorkspaces: { ...state.cloudWorkspaces, ...patch },
				})),
			setProjectsDisplay: (patch) =>
				set((state) => ({ projects: { ...state.projects, ...patch } })),
		}),
		{ name: LIST_DISPLAY_STORAGE_KEY, version: 1 },
	),
);
