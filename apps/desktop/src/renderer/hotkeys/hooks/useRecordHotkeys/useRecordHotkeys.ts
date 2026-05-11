import { useEffect, useRef } from "react";
import { HOTKEYS, type HotkeyId, PLATFORM } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";
import { getMatchByTypedKey } from "../../stores/keyboardPreferencesStore";
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

/**
 * Builds the chord in the same frame {@link eventToChord} uses for
 * dispatch — `event.code` when matching by physical key, `event.key` when
 * matching by typed character. Recording in the wrong frame would store a
 * chord the user can't fire.
 *
 * Named keys (Enter, F-keys, arrows) always use `event.code` since their
 * `event.key` form lower-cases to the same token (`Enter` → `enter`).
 */
export function captureHotkeyFromEvent(
	event: KeyboardEvent,
): { chord: string } | null {
	if (event.code === undefined) return null;
	const codeKey = normalizeToken(event.code);
	if (isIgnorableKey(codeKey)) return null;

	const isFKey = /^f([1-9]|1[0-2])$/.test(codeKey);
	// Mac Option is a legitimate shortcut modifier (⌥⌫ = delete-word). On
	// other platforms Alt is the menu key and AltGr masquerades as ctrl+alt,
	// so we still require ctrl/meta.
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

	const terminal = chordTerminalForCapture(event, codeKey, isFKey);
	if (!terminal) return null;
	return { chord: [...ordered, terminal].join("+") };
}

function chordTerminalForCapture(
	event: KeyboardEvent,
	codeKey: string,
	isFKey: boolean,
): string | null {
	// Named keys / F-keys are layout-stable; always use the event.code form.
	if (isFKey || NAMED_TOKENS.has(codeKey)) return codeKey;
	if (!getMatchByTypedKey()) return codeKey;
	// matchByTypedKey ON: capture the typed character so the binding
	// round-trips through eventToChord's event.key path.
	const k = (event.key ?? "").toLowerCase();
	// Single printable char only. Multi-char keys (`Dead`, `Process`) and
	// `+` (would collide with the chord separator) fall back to the code
	// form so the binding is still recordable.
	if (k.length === 1 && /\S/.test(k) && k !== "+") return k;
	return codeKey;
}

const NAMED_TOKENS = new Set([
	"enter",
	"escape",
	"backspace",
	"delete",
	"tab",
	"space",
	"arrowup",
	"arrowdown",
	"arrowleft",
	"arrowright",
	"home",
	"end",
	"pageup",
	"pagedown",
	"insert",
]);

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

function getHotkeyConflict(
	candidate: string,
	excludeId: HotkeyId,
): HotkeyId | null {
	const { overrides } = useHotkeyOverridesStore.getState();
	const target = canonicalizeChord(candidate);
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		if (id === excludeId) continue;
		const effective = id in overrides ? overrides[id] : HOTKEYS[id].key;
		if (!effective) continue;
		if (canonicalizeChord(effective) === target) return id;
	}
	return null;
}

interface UseRecordHotkeysOptions {
	onSave?: (id: HotkeyId, binding: string) => void;
	onCancel?: () => void;
	onUnassign?: (id: HotkeyId) => void;
	onConflict?: (
		targetId: HotkeyId,
		binding: string,
		conflictId: HotkeyId,
	) => void;
	onReserved?: (
		binding: string,
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
			const binding = captured.chord;

			const reserved = checkReserved(binding);
			if (reserved?.severity === "error") {
				optionsRef.current?.onReserved?.(binding, reserved);
				return;
			}

			const conflictId = getHotkeyConflict(binding, recordingId);
			if (conflictId) {
				optionsRef.current?.onConflict?.(recordingId, binding, conflictId);
				return;
			}

			if (reserved?.severity === "warning") {
				optionsRef.current?.onReserved?.(binding, reserved);
			}

			const defaultBinding = HOTKEYS[recordingId].key;
			if (
				defaultBinding &&
				canonicalizeChord(binding) === canonicalizeChord(defaultBinding)
			) {
				resetOverride(recordingId);
			} else {
				setOverride(recordingId, binding);
			}
			optionsRef.current?.onSave?.(recordingId, binding);
		};

		window.addEventListener("keydown", handler, { capture: true });
		return () =>
			window.removeEventListener("keydown", handler, { capture: true });
	}, [recordingId, setOverride, resetOverride]);

	return { isRecording: !!recordingId };
}
