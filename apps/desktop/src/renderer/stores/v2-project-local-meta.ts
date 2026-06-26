import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ProjectMeta {
	isCollapsed: boolean;
	tabOrder: number;
	color: string;
}

interface V2ProjectLocalMetaState {
	projects: Record<string, ProjectMeta>;

	getProjectMeta: (id: string) => ProjectMeta;
	toggleProjectCollapsed: (id: string) => void;
	setProjectTabOrder: (id: string, order: number) => void;
	setProjectColor: (id: string, color: string) => void;
}

const DEFAULT_PROJECT_META: ProjectMeta = {
	isCollapsed: false,
	tabOrder: 0,
	color: PROJECT_COLOR_DEFAULT,
};

export const useV2ProjectLocalMetaStore = create<V2ProjectLocalMetaState>()(
	devtools(
		persist(
			(set, get) => ({
				projects: {},

				getProjectMeta: (id) => {
					return get().projects[id] ?? DEFAULT_PROJECT_META;
				},

				toggleProjectCollapsed: (id) => {
					set((state) => {
						const current = state.projects[id] ?? DEFAULT_PROJECT_META;
						return {
							projects: {
								...state.projects,
								[id]: { ...current, isCollapsed: !current.isCollapsed },
							},
						};
					});
				},

				setProjectTabOrder: (id, order) => {
					set((state) => {
						const current = state.projects[id] ?? DEFAULT_PROJECT_META;
						return {
							projects: {
								...state.projects,
								[id]: { ...current, tabOrder: order },
							},
						};
					});
				},

				setProjectColor: (id, color) => {
					set((state) => {
						const current = state.projects[id] ?? DEFAULT_PROJECT_META;
						return {
							projects: {
								...state.projects,
								[id]: { ...current, color },
							},
						};
					});
				},
			}),
			{
				name: "v2-project-local-meta",
				version: 1,
			},
		),
		{ name: "V2ProjectLocalMetaStore" },
	),
);
