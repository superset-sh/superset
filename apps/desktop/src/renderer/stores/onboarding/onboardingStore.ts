import { track } from "renderer/lib/analytics";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type OnboardingStep =
	| "providers"
	| "gh-cli"
	| "permissions"
	| "project"
	| "adopt-worktrees";

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
	"providers",
	"gh-cli",
	"permissions",
	"project",
	"adopt-worktrees",
] as const;

const REQUIRED_STEPS: readonly OnboardingStep[] = [
	"providers",
	"project",
] as const;

export const STEP_ROUTES = {
	providers: "/setup/providers",
	"gh-cli": "/setup/gh-cli",
	permissions: "/setup/permissions",
	project: "/setup/project",
	"adopt-worktrees": "/setup/adopt-worktrees",
} as const satisfies Record<OnboardingStep, string>;

const STEP_FLAGS_INITIAL: Record<OnboardingStep, boolean> = {
	providers: false,
	"gh-cli": false,
	permissions: false,
	project: false,
	"adopt-worktrees": false,
};

interface OnboardingState {
	currentStep: OnboardingStep;
	completed: Record<OnboardingStep, boolean>;
	skipped: Record<OnboardingStep, boolean>;
	startedAt: number | null;
	completedAt: number | null;
	/**
	 * When true, the user explicitly restarted onboarding from Settings.
	 * Steps must NOT auto-advance based on already-satisfied prerequisites —
	 * the user wants to walk through. Cleared when the flow finishes.
	 */
	manualWalkthrough: boolean;
}

interface OnboardingActions {
	markComplete: (step: OnboardingStep) => void;
	markSkipped: (step: OnboardingStep) => void;
	goTo: (step: OnboardingStep) => void;
	next: () => OnboardingStep | null;
	back: () => OnboardingStep | null;
	reset: () => void;
	setManualWalkthrough: (value: boolean) => void;
}

type OnboardingStore = OnboardingState & OnboardingActions;

const initialState: OnboardingState = {
	currentStep: "providers",
	completed: { ...STEP_FLAGS_INITIAL },
	skipped: { ...STEP_FLAGS_INITIAL },
	startedAt: null,
	completedAt: null,
	manualWalkthrough: false,
};

function getNextStep(step: OnboardingStep): OnboardingStep | null {
	const idx = ONBOARDING_STEP_ORDER.indexOf(step);
	if (idx < 0 || idx >= ONBOARDING_STEP_ORDER.length - 1) return null;
	return ONBOARDING_STEP_ORDER[idx + 1] ?? null;
}

function getPrevStep(step: OnboardingStep): OnboardingStep | null {
	const idx = ONBOARDING_STEP_ORDER.indexOf(step);
	if (idx <= 0) return null;
	return ONBOARDING_STEP_ORDER[idx - 1] ?? null;
}

export const useOnboardingStore = create<OnboardingStore>()(
	devtools(
		persist(
			(set, get) => ({
				...initialState,
				markComplete: (step) => {
					const prev = get();
					if (prev.completed[step]) return; // idempotent
					track("onboarding_step_completed", { step });
					const completed = { ...prev.completed, [step]: true };
					const allDone = ONBOARDING_STEP_ORDER.every(
						(s) => completed[s] || prev.skipped[s],
					);
					set({
						completed,
						startedAt: prev.startedAt ?? Date.now(),
						completedAt: allDone ? Date.now() : prev.completedAt,
					});
				},
				markSkipped: (step) => {
					const prev = get();
					if (prev.skipped[step]) return;
					track("onboarding_step_skipped", { step });
					const skipped = { ...prev.skipped, [step]: true };
					const allDone = ONBOARDING_STEP_ORDER.every(
						(s) => prev.completed[s] || skipped[s],
					);
					set({
						skipped,
						startedAt: prev.startedAt ?? Date.now(),
						completedAt: allDone ? Date.now() : prev.completedAt,
					});
				},
				goTo: (step) => {
					const prev = get();
					if (prev.currentStep === step && prev.startedAt !== null) return;
					if (prev.startedAt === null) {
						track("onboarding_started", { entryStep: step });
					}
					if (prev.currentStep !== step) {
						track("onboarding_step_started", { step });
					}
					set({
						currentStep: step,
						startedAt: prev.startedAt ?? Date.now(),
					});
				},
				next: () => {
					const target = getNextStep(get().currentStep);
					if (target) set({ currentStep: target });
					return target;
				},
				back: () => {
					const target = getPrevStep(get().currentStep);
					if (target) set({ currentStep: target });
					return target;
				},
				reset: () => {
					track("onboarding_restarted");
					set({
						currentStep: "providers",
						completed: { ...STEP_FLAGS_INITIAL },
						skipped: { ...STEP_FLAGS_INITIAL },
						startedAt: null,
						completedAt: null,
						manualWalkthrough: false,
					});
				},
				setManualWalkthrough: (value) => set({ manualWalkthrough: value }),
			}),
			{ name: "superset-onboarding-v1" },
		),
		{ name: "OnboardingStore" },
	),
);

export function selectRequiredStepsComplete(state: OnboardingState): boolean {
	return REQUIRED_STEPS.every((s) => state.completed[s] || state.skipped[s]);
}

export function selectFirstIncompleteStep(
	state: OnboardingState,
): OnboardingStep {
	for (const step of ONBOARDING_STEP_ORDER) {
		if (!state.completed[step] && !state.skipped[step]) return step;
	}
	return "providers";
}
