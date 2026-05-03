import { useEffect, useRef } from "react";
import { HOTKEYS, type HotkeyId, PLATFORM } from "../../registry";
import { useHotkeyOverridesStore } from "../../stores/hotkeyOverridesStore";
import { useKeyboardLayoutStore } from "../../stores/keyboardLayoutStore";
import type {
	BindingMode,
	ParsedBinding,
	Platform,
	ShortcutBinding,
} from "../../types";
import {
	bindingsEqual,
	bindingToDispatchChord,
	isFunctionKey,
	NAMED_KEYS,
	serializeBinding,
} from "../../utils/binding";
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

export interface CapturedHotkey {
	/** Modifiers + canonical(event.code). Always meaningful. */
	codeChord: string;
	/** Modifiers + lowercased event.key for printable letters/digits/punctuation;
	 *  identical to codeChord for named keys / F-keys. */
	keyChord: string;
	classification: "named" | "fkey" | "printable";
}

export function captureHotkeyFromEvent(
	event: KeyboardEvent,
): CapturedHotkey | null {
	if (event.code === undefined) return null;
	const codeKey = normalizeToken(event.code);
	if (isIgnorableKey(codeKey)) return null;

	const isFKey = isFunctionKey(codeKey);
	const isNamed = NAMED_KEYS.has(codeKey);
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

	const codeChord = [...ordered, codeKey].join("+");

	let classification: "named" | "fkey" | "printable" = "printable";
	if (isFKey) classification = "fkey";
	else if (isNamed) classification = "named";

	let keyChord = codeChord;
	if (classification === "printable") {
		const produced = (event.key ?? "").toLowerCase();
		// Single printable char only — strings like "Dead", "Process" or
		// multi-char IME output stay on codeChord. "+" would collide with
		// the chord separator and break round-tripping (`meta+shift++`).
		if (produced.length === 1 && /\S/.test(produced) && produced !== "+") {
			keyChord = [...ordered, produced].join("+");
		}
	}
	return { codeChord, keyChord, classification };
}

/**
 * Pick the right chord + mode for a captured event, given a user mode
 * preference. F-keys and named keys force `named` regardless of preference.
 */
export function resolveCapturedBinding(
	captured: CapturedHotkey,
	preferredMode: "physical" | "logical",
): ParsedBinding {
	if (captured.classification === "fkey" || captured.classification === "named")
		return { mode: "named", chord: captured.codeChord };
	const mode: BindingMode = preferredMode;
	const chord = mode === "logical" ? captured.keyChord : captured.codeChord;
	return { mode, chord };
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

function getHotkeyConflict(
	candidate: ShortcutBinding,
	excludeId: HotkeyId,
): HotkeyId | null {
	const { overrides } = useHotkeyOverridesStore.getState();
	const layoutMap = useKeyboardLayoutStore.getState().map;
	const candidateDispatch = bindingToDispatchChord(candidate, layoutMap);
	if (!candidateDispatch) return null;
	const target = canonicalizeChord(candidateDispatch);
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		if (id === excludeId) continue;
		const effective = id in overrides ? overrides[id] : HOTKEYS[id].key;
		if (!effective) continue;
		const otherDispatch = bindingToDispatchChord(effective, layoutMap);
		if (otherDispatch && canonicalizeChord(otherDispatch) === target) return id;
	}
	return null;
}

interface UseRecordHotkeysOptions {
	/** User's mode preference for new printable bindings. Default `"logical"`
	 *  — the recorded chord follows the printed character (Dvorak user
	 *  pressing the P-labeled key gets a binding for the P character, which
	 *  works on any layout). F-keys and named keys ignore this and use
	 *  `"named"` mode regardless. */
	preferredMode?: "physical" | "logical";
	onSave?: (id: HotkeyId, binding: ShortcutBinding) => void;
	onCancel?: () => void;
	onUnassign?: (id: HotkeyId) => void;
	onConflict?: (
		targetId: HotkeyId,
		binding: ShortcutBinding,
		conflictId: HotkeyId,
	) => void;
	onReserved?: (
		binding: ShortcutBinding,
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

			const preferredMode = optionsRef.current?.preferredMode ?? "logical";
			const parsed = resolveCapturedBinding(captured, preferredMode);
			const binding = serializeBinding(parsed);

			// Reserved chords gate on the dispatch chord (event.code form), since
			// that's what the OS / terminal sees when the user presses the key.
			const reserved = checkReserved(captured.codeChord);
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
			if (defaultBinding && bindingsEqual(binding, defaultBinding)) {
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
