import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import { getHotkeyKeys } from "renderer/stores/hotkeys";
import { usePresetChordStore } from "renderer/stores/preset-chord-store";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { AddTabOptions } from "renderer/stores/tabs/types";
import { DEFAULT_CHORD_TIMEOUT_MS } from "shared/constants";
import { matchesHotkeyEvent } from "shared/hotkeys";

interface UsePresetChordShortcutParams {
	workspaceId: string;
	addTab: (
		workspaceId: string,
		options?: AddTabOptions,
	) => { tabId: string; paneId: string };
}

/**
 * Hook that implements chord shortcuts for opening tabs with presets.
 * Press NEW_GROUP hotkey followed by a number (1-9) within the configured
 * timeout to open a tab with the preset at that position. If no number is
 * pressed, falls back to default preset behavior.
 */
export function usePresetChordShortcut({
	workspaceId,
	addTab,
}: UsePresetChordShortcutParams) {
	const { presets } = usePresets();
	const renameTab = useTabsStore((s) => s.renameTab);
	const setChordActive = usePresetChordStore((s) => s.setChordActive);

	// Query the chord timeout setting
	const { data: chordTimeout } =
		electronTrpc.settings.getChordTimeout.useQuery();
	const chordTimeoutMs = chordTimeout ?? DEFAULT_CHORD_TIMEOUT_MS;

	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isWaitingRef = useRef(false);

	// Store latest values in refs to avoid stale closures
	const workspaceIdRef = useRef(workspaceId);
	const addTabRef = useRef(addTab);
	const presetsRef = useRef(presets);
	const renameTabRef = useRef(renameTab);
	const chordTimeoutMsRef = useRef(chordTimeoutMs);

	useEffect(() => {
		workspaceIdRef.current = workspaceId;
		addTabRef.current = addTab;
		presetsRef.current = presets;
		renameTabRef.current = renameTab;
		chordTimeoutMsRef.current = chordTimeoutMs;
	}, [workspaceId, addTab, presets, renameTab, chordTimeoutMs]);

	const clearChordState = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		isWaitingRef.current = false;
		setChordActive(false);
	}, [setChordActive]);

	const openTabWithPreset = useCallback((presetIndex: number) => {
		const currentPresets = presetsRef.current;
		const preset = currentPresets[presetIndex];

		if (preset) {
			// Open tab with specific preset
			const options: AddTabOptions = {
				initialCommands: preset.commands,
				initialCwd: preset.cwd || undefined,
			};
			const result = addTabRef.current(workspaceIdRef.current, options);
			if (preset.name) {
				renameTabRef.current(result.tabId, preset.name);
			}
		} else {
			// Preset index out of range - fall back to default behavior
			addTabRef.current(workspaceIdRef.current);
		}
	}, []);

	const openTabWithDefault = useCallback(() => {
		// Just call addTab without options - it will use default preset via useTabsWithPresets
		addTabRef.current(workspaceIdRef.current);
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const newGroupKeys = getHotkeyKeys("NEW_GROUP");
			if (!newGroupKeys) return;

			// If we're in chord waiting state
			if (isWaitingRef.current) {
				// Check for number keys 1-9
				const key = event.key;
				if (key >= "1" && key <= "9") {
					event.preventDefault();
					event.stopPropagation();
					clearChordState();
					const presetIndex = parseInt(key, 10) - 1; // Convert to 0-indexed
					openTabWithPreset(presetIndex);
					return;
				}

				// Escape cancels the chord without opening a tab
				if (key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					clearChordState();
					return;
				}

				// Any other key cancels the chord without action
				// (but don't prevent default - let other handlers process it)
				clearChordState();
				return;
			}

			// Check if this is the NEW_GROUP hotkey
			if (matchesHotkeyEvent(event, newGroupKeys)) {
				event.preventDefault();
				event.stopPropagation();

				// Enter chord waiting state
				isWaitingRef.current = true;
				setChordActive(true);

				// Set timeout for fallback to default behavior
				timeoutRef.current = setTimeout(() => {
					if (isWaitingRef.current) {
						clearChordState();
						openTabWithDefault();
					}
				}, chordTimeoutMsRef.current);
			}
		};

		// Use capture phase to intercept before useAppHotkey
		document.addEventListener("keydown", handleKeyDown, { capture: true });

		return () => {
			document.removeEventListener("keydown", handleKeyDown, { capture: true });
			clearChordState();
		};
	}, [clearChordState, openTabWithPreset, openTabWithDefault, setChordActive]);
}
