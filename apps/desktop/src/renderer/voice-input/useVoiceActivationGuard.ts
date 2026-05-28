import { useCallback } from "react";
import type { VoiceActivationResult, VoiceActivationTarget } from "./types";

type VoiceActivationGuardOptions = {
	voiceInputEnabled: boolean;
	getActiveTarget: () => VoiceActivationTarget | null;
};

type VoiceActivationShortcutOptions = VoiceActivationGuardOptions & {
	onActivate?: (target: VoiceActivationTarget) => void;
};

type UseVoiceActivationGuardOptions = {
	voiceInputEnabled: boolean;
	getActiveTarget?: () => VoiceActivationTarget | null;
	onActivate?: (target: VoiceActivationTarget) => void;
};

function isVoiceActivationTarget(
	value: string | undefined,
): value is VoiceActivationTarget {
	return value === "chat" || value === "terminal";
}

export function getFocusedVoiceActivationTarget(): VoiceActivationTarget | null {
	if (typeof document === "undefined") {
		return null;
	}

	const activeElement = document.activeElement;
	if (!(activeElement instanceof HTMLElement)) {
		return null;
	}

	const targetElement = activeElement.closest("[data-voice-input-target]");
	const target =
		targetElement?.getAttribute("data-voice-input-target") ?? undefined;
	if (!isVoiceActivationTarget(target)) {
		return null;
	}

	return target;
}

export function evaluateVoiceActivationGuard({
	voiceInputEnabled,
	getActiveTarget,
}: VoiceActivationGuardOptions): VoiceActivationResult {
	if (!voiceInputEnabled) {
		return { status: "disabled" };
	}

	const target = getActiveTarget();
	if (!target) {
		return {
			status: "unsupported-target",
			reason: "no-supported-target-focused",
		};
	}

	return { status: "allowed", target };
}

export function runVoiceActivationShortcut({
	onActivate,
	...options
}: VoiceActivationShortcutOptions): VoiceActivationResult {
	const result = evaluateVoiceActivationGuard(options);

	if (result.status !== "allowed") {
		return result;
	}

	const { target } = result;
	onActivate?.(target);
	return result;
}

export function runVoiceActivationHotkeyEvent(
	event: Pick<KeyboardEvent, "preventDefault">,
	runShortcut: () => VoiceActivationResult,
): VoiceActivationResult {
	const result = runShortcut();

	if (result.status === "allowed") {
		event.preventDefault();
	}

	return result;
}

export function useVoiceActivationGuard({
	voiceInputEnabled,
	getActiveTarget = getFocusedVoiceActivationTarget,
	onActivate,
}: UseVoiceActivationGuardOptions): () => VoiceActivationResult {
	return useCallback(
		() =>
			runVoiceActivationShortcut({
				voiceInputEnabled,
				getActiveTarget,
				onActivate,
			}),
		[voiceInputEnabled, getActiveTarget, onActivate],
	);
}
