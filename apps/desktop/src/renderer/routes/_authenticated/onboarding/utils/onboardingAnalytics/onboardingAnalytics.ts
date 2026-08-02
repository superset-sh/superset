import { track } from "renderer/lib/analytics";

export type OnboardingStep = "providers" | "project";

// Module-level so remounts and route bounces within a renderer session
// can't double-fire onboarding_started or duplicate step_started events.
let started = false;
let finished = false;
let currentStep: OnboardingStep | null = null;
let abandonTimer: ReturnType<typeof setTimeout> | null = null;

export function trackOnboardingEntered(step: OnboardingStep): void {
	if (abandonTimer !== null) {
		clearTimeout(abandonTimer);
		abandonTimer = null;
	}
	if (!started) {
		started = true;
		track("onboarding_started");
	}
	if (currentStep !== step) {
		currentStep = step;
		track("onboarding_step_started", { step });
	}
}

export function trackOnboardingStepCompleted(step: OnboardingStep): void {
	track("onboarding_step_completed", { step });
}

/** Reason codes only — never include URLs, repo names, paths, or messages. */
export function trackOnboardingError(
	step: OnboardingStep,
	action: string,
	reason: string,
): void {
	track("onboarding_error", { step, action, reason });
}

export function markOnboardingFinished(): void {
	finished = true;
}

export function flushOnboardingAbandoned(): void {
	if (!started || finished || currentStep === null) return;
	track("onboarding_abandoned", { step: currentStep });
	currentStep = null;
}

// Deferred a tick so StrictMode's unmount/remount and route bounces through
// the layout don't register as abandonment; re-entry cancels the timer.
export function scheduleOnboardingAbandoned(): void {
	if (abandonTimer !== null) clearTimeout(abandonTimer);
	abandonTimer = setTimeout(() => {
		abandonTimer = null;
		flushOnboardingAbandoned();
	}, 0);
}
