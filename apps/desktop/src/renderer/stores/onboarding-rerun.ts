import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface OnboardingRerunState {
	/**
	 * True while the user is re-running onboarding from Settings. The onboarding
	 * route normally redirects away once `onboardedAt` is set; this flag lets it
	 * render anyway. Deliberately not persisted — a relaunch should fall back to
	 * the redirect so a restored `/onboarding` route can't trap an onboarded user.
	 */
	isRerun: boolean;
	startRerun: () => void;
	endRerun: () => void;
}

export const useOnboardingRerunStore = create<OnboardingRerunState>()(
	devtools(
		(set) => ({
			isRerun: false,
			startRerun: () => {
				set({ isRerun: true });
			},
			endRerun: () => {
				set({ isRerun: false });
			},
		}),
		{ name: "OnboardingRerunStore" },
	),
);

export const useStartOnboardingRerun = () =>
	useOnboardingRerunStore((state) => state.startRerun);
