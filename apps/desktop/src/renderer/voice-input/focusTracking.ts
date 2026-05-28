import type { VoiceActivationTarget } from "./types";

let lastVoiceInputTargetElement: HTMLElement | null = null;

function isVoiceTargetValue(
	value: string | undefined | null,
): value is VoiceActivationTarget {
	return value === "chat" || value === "terminal";
}

function isVoiceInputTargetElement(
	element: HTMLElement | null,
): element is HTMLElement {
	return isVoiceTargetValue(element?.getAttribute("data-voice-input-target"));
}

export function rememberVoiceInputTargetElement(
	element: HTMLElement | null,
): void {
	if (!isVoiceInputTargetElement(element)) return;
	lastVoiceInputTargetElement = element;
}

export function rememberVoiceInputTargetFromEvent({
	currentTarget,
}: {
	currentTarget: EventTarget | null;
}): void {
	if (currentTarget instanceof HTMLElement) {
		rememberVoiceInputTargetElement(currentTarget);
	}
}

export function getRememberedVoiceInputTargetElement(): HTMLElement | null {
	if (!isVoiceInputTargetElement(lastVoiceInputTargetElement)) {
		lastVoiceInputTargetElement = null;
		return null;
	}
	if (!lastVoiceInputTargetElement.isConnected) {
		lastVoiceInputTargetElement = null;
		return null;
	}
	return lastVoiceInputTargetElement;
}

export function shouldFallbackToRememberedVoiceTarget(
	activeElement: Element | null,
): boolean {
	if (!activeElement) return true;
	if (
		activeElement === document.body ||
		activeElement === document.documentElement
	) {
		return true;
	}
	if (!(activeElement instanceof HTMLElement)) return false;
	return (
		activeElement.classList.contains("xterm-helper-textarea") ||
		activeElement.closest(".xterm") !== null
	);
}
