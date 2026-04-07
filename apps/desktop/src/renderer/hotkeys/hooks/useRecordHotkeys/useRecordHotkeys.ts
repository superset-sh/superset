import { useEffect, useRef } from "react";
import { HOTKEYS, type HotkeyId, PLATFORM } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";
import type { Platform } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODIFIER_ORDER = ["meta", "ctrl", "alt", "shift"] as const;

function captureHotkeyFromEvent(event: KeyboardEvent): string | null {
	const key = event.key.toLowerCase();
	if (["shift", "ctrl", "alt", "meta", "dead", "unidentified"].includes(key))
		return null;

	// Must include ctrl or meta (or be F1-F12)
	const isFKey = /^f([1-9]|1[0-2])$/.test(key);
	if (!isFKey && !event.ctrlKey && !event.metaKey) return null;

	// Reject meta on non-Mac
	if (PLATFORM !== "mac" && event.metaKey) return null;

	const modifiers: string[] = [];
	if (event.metaKey) modifiers.push("meta");
	if (event.ctrlKey) modifiers.push("ctrl");
	if (event.altKey) modifiers.push("alt");
	if (event.shiftKey) modifiers.push("shift");

	const ordered = MODIFIER_ORDER.filter((m) => modifiers.includes(m));
	return [...ordered, key].join("+");
}

const TERMINAL_RESERVED = new Set([
	"ctrl+c",
	"ctrl+d",
	"ctrl+z",
	"ctrl+s",
	"ctrl+q",
	"ctrl+\\",
]);

const OS_RESERVED: Record<Platform, string[]> = {
	mac: ["meta+q", "meta+space", "meta+tab"],
	windows: ["alt+f4", "alt+tab", "ctrl+alt+delete"],
	linux: ["alt+f4", "alt+tab"],
};

function checkReserved(
	keys: string,
): { reason: string; severity: "error" | "warning" } | null {
	if (TERMINAL_RESERVED.has(keys))
		return { reason: "Reserved by terminal", severity: "error" };
	if (OS_RESERVED[PLATFORM].includes(keys))
		return { reason: "Reserved by OS", severity: "warning" };
	return null;
}

function getHotkeyConflict(keys: string, excludeId: HotkeyId): HotkeyId | null {
	const { overrides } = useHotkeyOverridesStore.getState();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		if (id === excludeId) continue;
		const effective = id in overrides ? overrides[id] : HOTKEYS[id].key;
		if (effective === keys) return id;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseRecordHotkeysOptions {
	onSave?: (id: HotkeyId, keys: string) => void;
	onCancel?: () => void;
	onUnassign?: (id: HotkeyId) => void;
	onConflict?: (targetId: HotkeyId, keys: string, conflictId: HotkeyId) => void;
	onReserved?: (
		keys: string,
		info: { reason: string; severity: "error" | "warning" },
	) => void;
}

export function useRecordHotkeys(
	recordingId: HotkeyId | null,
	options?: UseRecordHotkeysOptions,
) {
	const optionsRef = useRef(options);
	optionsRef.current = options;

	const setOverride = useHotkeyOverridesStore((s) => s.setOverride);
	const resetOverride = useHotkeyOverridesStore((s) => s.resetOverride);

	useEffect(() => {
		if (!recordingId) return;

		const handler = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				optionsRef.current?.onCancel?.();
				return;
			}

			if (event.key === "Backspace" || event.key === "Delete") {
				setOverride(recordingId, null);
				optionsRef.current?.onUnassign?.(recordingId);
				return;
			}

			const captured = captureHotkeyFromEvent(event);
			if (!captured) return;

			const reserved = checkReserved(captured);
			if (reserved?.severity === "error") {
				optionsRef.current?.onReserved?.(captured, reserved);
				return;
			}

			const conflictId = getHotkeyConflict(captured, recordingId);
			if (conflictId) {
				optionsRef.current?.onConflict?.(recordingId, captured, conflictId);
				return;
			}

			if (reserved?.severity === "warning") {
				optionsRef.current?.onReserved?.(captured, reserved);
			}

			const defaultKey = HOTKEYS[recordingId].key;
			if (captured === defaultKey) {
				resetOverride(recordingId);
			} else {
				setOverride(recordingId, captured);
			}
			optionsRef.current?.onSave?.(recordingId, captured);
		};

		window.addEventListener("keydown", handler, { capture: true });
		return () =>
			window.removeEventListener("keydown", handler, { capture: true });
	}, [recordingId, setOverride, resetOverride]);

	return { isRecording: !!recordingId };
}
