import debounce from "lodash/debounce";
import { useCallback, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { sanitizeForTitle } from "../commandBuffer";

interface UseCommandBufferOptions {
	paneId: string;
	parentTabId: string | undefined;
	isAlternateScreenRef: React.MutableRefObject<boolean>;
}

/**
 * Manages command buffer state and auto-title updates.
 *
 * Tracks typed characters to:
 * - Update tab title on Enter (shows current command)
 * - Clear buffer on Ctrl+C or Escape
 * - Reset pane status on interrupt
 */
export function useCommandBuffer({
	paneId,
	parentTabId,
	isAlternateScreenRef,
}: UseCommandBufferOptions) {
	const commandBufferRef = useRef("");
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);

	const debouncedSetTitle = useRef(
		debounce((tabId: string, title: string) => {
			setTabAutoTitle(tabId, title);
		}, 100),
	);

	const handleKeyForBuffer = useCallback(
		(domEvent: KeyboardEvent) => {
			if (domEvent.key === "Enter") {
				if (!isAlternateScreenRef.current) {
					const title = sanitizeForTitle(commandBufferRef.current);
					if (title && parentTabId) {
						debouncedSetTitle.current(parentTabId, title);
					}
				}
				commandBufferRef.current = "";
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (domEvent.key === "Escape") {
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
		[paneId, parentTabId, isAlternateScreenRef],
	);

	const appendToBuffer = useCallback((text: string) => {
		commandBufferRef.current += text;
	}, []);

	const setTitle = useCallback(
		(title: string) => {
			if (title && parentTabId) {
				debouncedSetTitle.current(parentTabId, title);
			}
		},
		[parentTabId],
	);

	const cancelDebounce = useCallback(() => {
		debouncedSetTitle.current?.cancel?.();
	}, []);

	return {
		commandBufferRef,
		handleKeyForBuffer,
		appendToBuffer,
		setTitle,
		cancelDebounce,
	};
}
