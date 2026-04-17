import { useEffect, useRef } from "react";
import { HOTKEYS, type HotkeyId, PLATFORM } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";
import type { Platform } from "../../types";
import {
	canonicalizeChord,
	isIgnorableKey,
	normalizeToken,
	TERMINAL_RESERVED_CHORDS,
} from "../../utils/resolveHotkeyFromEvent";

// Matches the registry's written modifier order (`meta+alt+up`) so recorded
// strings stay visually aligned with defaults. Canonicalization handles
// reordering at compare time.
const MODIFIER_ORDER = ["meta", "ctrl", "alt", "shift"] as const;

export function captureHotkeyFromEvent(event: KeyboardEvent): string | null {
	// event.code (not event.key) so Shift+2 records as `2`, Alt+L on Mac as
	// `l`, and non-US layouts produce stable tokens matching the registry.
	if (event.code === undefined) return null;
	const key = normalizeToken(event.code);
	if (isIgnorableKey(key)) return null;

	const isFKey = /^f([1-9]|1[0-2])$/.test(key);
	// On Mac, Option is a legitimate shortcut modifier (e.g. ⌥⌫ for delete-word).
	// Elsewhere, Alt is the menu key and AltGr masquerades as ctrl+alt, so we
	// still require ctrl/meta.
	const altIsAppModifier = PLATFORM === "mac" && event.altKey;
	if (!isFKey && !event.ctrlKey && !event.metaKey && !altIsAppModifier) {
		return null;
	}

	const modifiers = new Set<string>();
	if (event.metaKey) modifiers.add("meta");
	if (event.ctrlKey) modifiers.add("ctrl");
	if (event.altKey) modifiers.add("alt");
	if (event.shiftKey) modifiers.add("shift");

	const ordered = MODIFIER_ORDER.filter((m) => modifiers.has(m));
	return [...ordered, key].join("+");
}

// Chords the OS / shell is likely to intercept. Binding is allowed (Linux
// WM configs vary), but the recorder emits a warning so the user knows why
// a chord they just bound might not fire. Canonicalized at build time so
// multi-modifier entries (e.g. `ctrl+alt+delete` → `alt+ctrl+delete`) match.
const OS_RESERVED: Record<Platform, Set<string>> = {
	mac: new Set(["meta+q", "meta+space", "meta+tab"].map(canonicalizeChord)),
	windows: new Set(
		[
			"alt+f4",
			"alt+tab",
			"ctrl+alt+delete",
			"meta+d", // Show desktop
			"meta+e", // Explorer
			"meta+l", // Lock
			"meta+r", // Run
			"meta+tab", // Task view
		].map(canonicalizeChord),
	),
	linux: new Set(["alt+f4", "alt+tab"].map(canonicalizeChord)),
};

function isMacAltOnlyChord(canonical: string): boolean {
	const mods = new Set(canonical.split("+").slice(0, -1));
	return mods.has("alt") && !mods.has("meta") && !mods.has("ctrl");
}

function checkReserved(
	keys: string,
): { reason: string; severity: "error" | "warning" } | null {
	const canonical = canonicalizeChord(keys);
	if (TERMINAL_RESERVED_CHORDS.has(canonical))
		return { reason: "Reserved by terminal", severity: "error" };
	if (OS_RESERVED[PLATFORM].has(canonical))
		return { reason: "Reserved by OS", severity: "warning" };
	if (PLATFORM === "mac" && isMacAltOnlyChord(canonical))
		return {
			reason: "Option shortcuts may prevent typing special characters",
			severity: "warning",
		};
	return null;
}

function getHotkeyConflict(keys: string, excludeId: HotkeyId): HotkeyId | null {
	const { overrides } = useHotkeyOverridesStore.getState();
	const canonicalKeys = canonicalizeChord(keys);
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		if (id === excludeId) continue;
		const effective = id in overrides ? overrides[id] : HOTKEYS[id].key;
		if (effective && canonicalizeChord(effective) === canonicalKeys) return id;
	}
	return null;
}

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
			if (
				defaultKey &&
				canonicalizeChord(captured) === canonicalizeChord(defaultKey)
			) {
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
