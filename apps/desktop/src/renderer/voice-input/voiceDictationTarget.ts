import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import {
	VOICE_DICTATION_INSERT_EVENT,
	type VoiceDictationInsertDetail,
} from "./events";
import type { VoiceDictationTarget } from "./hooks/useVoiceDictation";
import { getTerminalVoiceTarget } from "./terminalVoiceTargets";
import {
	getFocusedVoiceInputTargetElement,
	isVoiceActivationTarget,
} from "./useVoiceActivationGuard";

export const VOICE_TERMINAL_ID_ATTRIBUTE = "data-voice-terminal-id";
export const VOICE_TERMINAL_INSTANCE_ID_ATTRIBUTE =
	"data-voice-terminal-instance-id";
export const VOICE_TERMINAL_REGISTRY_ID_ATTRIBUTE =
	"data-voice-terminal-registry-id";

function getEditableElement(
	targetElement: HTMLElement,
): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
	const activeElement = document.activeElement;
	if (activeElement instanceof HTMLInputElement) return activeElement;
	if (activeElement instanceof HTMLTextAreaElement) return activeElement;
	if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
		return activeElement;
	}
	return targetElement.querySelector(
		"textarea, input, [contenteditable='true']",
	);
}

function insertTextIntoEditable(
	element: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
	text: string,
): boolean {
	if (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement
	) {
		const start = element.selectionStart ?? element.value.length;
		const end = element.selectionEnd ?? element.value.length;
		element.setRangeText(text, start, end, "end");
		element.dispatchEvent(new Event("input", { bubbles: true }));
		element.focus();
		return true;
	}

	if (!element.isContentEditable) {
		return false;
	}

	element.focus();
	return document.execCommand("insertText", false, text);
}

function createTerminalDictationTarget(
	targetElement: HTMLElement,
): VoiceDictationTarget | null {
	const terminalRegistryId = targetElement.getAttribute(
		VOICE_TERMINAL_REGISTRY_ID_ATTRIBUTE,
	);
	if (terminalRegistryId) {
		const registeredTarget = getTerminalVoiceTarget(terminalRegistryId);
		if (registeredTarget) {
			return {
				kind: "terminal",
				label: registeredTarget.label ?? "Terminal",
				insertTranscript: (text) => {
					if (registeredTarget.isReady && !registeredTarget.isReady()) {
						return false;
					}
					registeredTarget.focus?.();
					return registeredTarget.write(text);
				},
			};
		}
	}

	const terminalId = targetElement.getAttribute(VOICE_TERMINAL_ID_ATTRIBUTE);
	if (!terminalId) return null;
	const terminalInstanceId =
		targetElement.getAttribute(VOICE_TERMINAL_INSTANCE_ID_ATTRIBUTE) ??
		terminalId;

	return {
		kind: "terminal",
		label: "Terminal",
		insertTranscript: (text) => {
			if (
				terminalRuntimeRegistry.getConnectionState(
					terminalId,
					terminalInstanceId,
				) !== "open"
			) {
				return false;
			}
			terminalRuntimeRegistry
				.getTerminal(terminalId, terminalInstanceId)
				?.focus();
			terminalRuntimeRegistry.writeInput(terminalId, text, terminalInstanceId);
			return true;
		},
	};
}

function createChatDictationTarget(
	targetElement: HTMLElement,
): VoiceDictationTarget {
	return {
		kind: "chat",
		label: "Chat",
		insertTranscript: (text) => {
			const detail: VoiceDictationInsertDetail = { text, handled: false };
			targetElement.dispatchEvent(
				new CustomEvent<VoiceDictationInsertDetail>(
					VOICE_DICTATION_INSERT_EVENT,
					{
						bubbles: true,
						detail,
					},
				),
			);
			if (detail.handled) return true;

			const editable = getEditableElement(targetElement);
			return editable ? insertTextIntoEditable(editable, text) : false;
		},
	};
}

export function getFocusedVoiceDictationTarget(): VoiceDictationTarget | null {
	const targetElement = getFocusedVoiceInputTargetElement();
	const target =
		targetElement?.getAttribute("data-voice-input-target") ?? undefined;
	if (!targetElement || !isVoiceActivationTarget(target)) {
		return null;
	}

	if (target === "terminal") {
		return createTerminalDictationTarget(targetElement);
	}

	return createChatDictationTarget(targetElement);
}
