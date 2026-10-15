import { track } from "renderer/lib/analytics";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	ACQUISITION_SOURCE_EVENT,
	type AcquisitionSource,
	buildAcquisitionSourceProperties,
} from "../../utils/acquisitionSource";

interface AcquisitionSourceState {
	source: AcquisitionSource | null;
	otherText: string;
	answered: boolean;
	setSource: (source: AcquisitionSource) => void;
	setOtherText: (otherText: string) => void;
	submit: () => void;
}

export const useAcquisitionSourceStore = create<AcquisitionSourceState>()(
	persist(
		(set, get) => ({
			source: null,
			otherText: "",
			answered: false,
			setSource: (source) => set({ source }),
			setOtherText: (otherText) => set({ otherText }),
			submit: () => {
				const { answered, source, otherText } = get();
				if (answered) return;
				const properties = buildAcquisitionSourceProperties(source, otherText);
				if (!properties) return;
				track(ACQUISITION_SOURCE_EVENT, properties);
				set({ answered: true, source: null, otherText: "" });
			},
		}),
		{
			name: "onboarding-acquisition-source-v1",
			partialize: (state) => ({ answered: state.answered }),
		},
	),
);
