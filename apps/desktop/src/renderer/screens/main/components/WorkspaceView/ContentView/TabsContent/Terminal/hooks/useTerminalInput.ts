import { useCallback, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { sanitizeForTitle } from "../commandBuffer";

export interface UseTerminalInputOptions {
	paneId: string;
	/** Ref to check if terminal is in alternate screen mode (TUI apps) */
	isAlternateScreenRef: React.RefObject<boolean>;
	/** Ref to parent tab ID for auto-title updates */
	parentTabIdRef: React.RefObject<string | undefined>;
	/** Debounced function to set tab auto title */
	debouncedSetTabAutoTitle: (tabId: string, title: string) => void;
}

export interface UseTerminalInputResult {
	/** Ref to current command buffer */
	commandBufferRef: React.RefObject<string>;
	/** Handler for terminal keypress events */
	handleKeyPress: (event: { key: string; domEvent: KeyboardEvent }) => void;
	/** Handler for pasted text (appends to command buffer) */
	handlePaste: (text: string) => void;
	/** Reset command buffer (e.g., on restart) */
	resetCommandBuffer: () => void;
}

/**
 * Hook to manage terminal input handling and command buffer.
 *
 * Encapsulates:
 * - Command buffer for auto-title generation
 * - Keypress handling (Enter, Backspace, Ctrl+C, ESC, regular chars)
 * - Pane status updates on interrupt
 * - Paste handling
 */
export function useTerminalInput({
	paneId,
	isAlternateScreenRef,
	parentTabIdRef,
	debouncedSetTabAutoTitle,
}: UseTerminalInputOptions): UseTerminalInputResult {
	const commandBufferRef = useRef("");

	const handleKeyPress = useCallback(
		(event: { key: string; domEvent: KeyboardEvent }) => {
			const { domEvent } = event;

			if (domEvent.key === "Enter") {
				// Don't auto-title from keyboard when in alternate screen (TUI apps like vim)
				// TUI apps set their own title via escape sequences handled by onTitleChange
				if (!isAlternateScreenRef.current) {
					const title = sanitizeForTitle(commandBufferRef.current);
					if (title && parentTabIdRef.current) {
						debouncedSetTabAutoTitle(parentTabIdRef.current, title);
					}
				}
				commandBufferRef.current = "";
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
				// Ctrl+C interrupts agent - clear working/permission status
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (domEvent.key === "Escape") {
				// ESC interrupts agent (e.g., Claude Code "stop generating") - clear status
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (
				domEvent.key.length === 1 &&
				!domEvent.ctrlKey &&
				!domEvent.metaKey
			) {
				commandBufferRef.current += domEvent.key;
			}
		},
		[paneId, isAlternateScreenRef, parentTabIdRef, debouncedSetTabAutoTitle],
	);

	const handlePaste = useCallback((text: string) => {
		commandBufferRef.current += text;
	}, []);

	const resetCommandBuffer = useCallback(() => {
		commandBufferRef.current = "";
	}, []);

	return {
		commandBufferRef,
		handleKeyPress,
		handlePaste,
		resetCommandBuffer,
	};
}
