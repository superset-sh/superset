import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface SectionMeta {
	name: string;
	tabOrder: number;
}

interface V2SectionLocalMetaState {
	sections: Record<string, SectionMeta>;
}

export const useV2SectionLocalMetaStore = create<V2SectionLocalMetaState>()(
	devtools(
		persist(
			() => ({
				sections: {},
			}),
			{
				name: "v2-section-local-meta",
				version: 1,
			},
		),
		{ name: "V2SectionLocalMetaStore" },
	),
);
