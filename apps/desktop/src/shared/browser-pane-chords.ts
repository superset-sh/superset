// Pure chord-matching helpers shared between the main process (Electron
// `before-input-event` on browser-pane webContents) and the renderer
// (react-hotkeys-hook reverse index). Kept free of any Electron, DOM, or
// zustand import so both sides can use them and bun:test can cover them
// without a webContents stub.

// Mirrors react-hotkeys-hook's alias table (react-hotkeys-hook/dist/index.js:3-19)
const CODE_ALIASES: Record<string, string> = {
	esc: "escape",
	return: "enter",
	left: "arrowleft",
	right: "arrowright",
	up: "arrowup",
	down: "arrowdown",
	MetaLeft: "meta",
	MetaRight: "meta",
	ShiftLeft: "shift",
	ShiftRight: "shift",
	AltLeft: "alt",
	AltRight: "alt",
	OSLeft: "meta",
	OSRight: "meta",
	ControlLeft: "ctrl",
	ControlRight: "ctrl",
};

export const MODIFIERS = new Set(["meta", "ctrl", "control", "alt", "shift"]);

// Lock keys must never commit a binding on their own.
const LOCK_KEYS = new Set(["capslock", "numlock", "scrolllock"]);

export function normalizeToken(token: string): string {
	const aliased = CODE_ALIASES[token.trim()] ?? token.trim();
	return aliased.toLowerCase().replace(/key|digit|numpad/, "");
}

export function isIgnorableKey(normalized: string): boolean {
	return !normalized || MODIFIERS.has(normalized) || LOCK_KEYS.has(normalized);
}

/**
 * Stable form for comparing chord strings. Tolerates modifier order and
 * aliases: `meta+alt+up` ≡ `alt+meta+arrowup` ≡ `control+alt+arrowup`.
 */
export function canonicalizeChord(chord: string): string {
	const parts = chord.toLowerCase().split("+").map(normalizeToken);
	const mods: string[] = [];
	const keys: string[] = [];
	for (const part of parts) {
		if (MODIFIERS.has(part)) {
			mods.push(part === "control" ? "ctrl" : part);
		} else {
			keys.push(part);
		}
	}
	mods.sort();
	return [...mods, ...keys].join("+");
}

/**
 * Minimal shape of an Electron `before-input-event` Input — only the fields
 * chord matching needs, so tests don't require Electron types.
 */
export interface BrowserPaneInput {
	type?: string;
	code?: string;
	key?: string;
	meta?: boolean;
	control?: boolean;
	alt?: boolean;
	shift?: boolean;
	isComposing?: boolean;
}

/** `before-input-event` Input → canonical chord, or null for modifier-only / unknown keys. */
export function inputToChord(input: BrowserPaneInput): string | null {
	if (input.type !== undefined && input.type !== "keyDown") return null;
	// IME composition: keydown during CJK / dead-key composition must not
	// trigger hotkeys, mirroring the renderer's `eventToChord` guard.
	if (input.isComposing) return null;
	if (input.code === undefined) return null;
	const key = normalizeToken(input.code);
	if (isIgnorableKey(key)) return null;
	const mods: string[] = [];
	if (input.meta) mods.push("meta");
	if (input.control) mods.push("ctrl");
	if (input.alt) mods.push("alt");
	if (input.shift) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}

/** DOM KeyboardEvent → canonical chord (comparable to {@link canonicalizeChord} output), or null for pure modifier / synthetic presses. */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	// IME composition: keydown during CJK / dead-key composition must not
	// trigger hotkeys. Safari reports keyCode 229 instead of isComposing.
	if (event.isComposing || event.keyCode === 229) return null;
	const key = normalizeToken(event.code);
	if (isIgnorableKey(key)) return null;
	// AltGr is reported by Chromium as ctrlKey+altKey on Windows/Linux.
	// Treating that combination as Ctrl+Alt would let printable keystrokes on
	// non-US layouts (e.g. AltGr+E = € on German) accidentally trigger
	// ctrl+alt+e bindings. Suppress both when AltGr is held; no binding opts
	// into AltGr explicitly.
	const altGraph = event.getModifierState?.("AltGraph") === true;
	const mods: string[] = [];
	if (event.metaKey) mods.push("meta");
	if (event.ctrlKey && !altGraph) mods.push("ctrl");
	if (event.altKey && !altGraph) mods.push("alt");
	if (event.shiftKey) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}

// Chords the app must NOT claim from a browser pane — the guest page's own
// editing / navigation behavior is more useful there than any of the
// pane-scoped app bindings sharing the chord:
//   - meta+a/c/v/x/z + ctrl+a/c/v/x/z: select-all, copy, paste, cut, undo
//     (no app binding uses these, but the guest must always keep them)
//   - meta+p print → QUICK_OPEN, meta+f find → FIND_IN_* family,
//     meta+g find-next → RUN_WORKSPACE_COMMAND
export const BROWSER_PANE_EXCLUDED_CHORDS = new Set(
	[
		"meta+a",
		"meta+c",
		"meta+v",
		"meta+x",
		"meta+z",
		"ctrl+a",
		"ctrl+c",
		"ctrl+v",
		"ctrl+x",
		"ctrl+z",
		"meta+f",
		"meta+p",
		"meta+g",
	].map(canonicalizeChord),
);

/**
 * True if `input` matches any of `chords` (pre-canonicalized) and is not
 * excluded. Returns the matched canonical chord, or null.
 */
export function matchAppChord(
	input: BrowserPaneInput,
	chords: ReadonlySet<string>,
): string | null {
	if (isGuestOwnedShortcut(input)) return null;
	const chord = inputToChord(input);
	if (!chord) return null;
	return chords.has(chord) ? chord : null;
}

// Guest editing shortcuts are LOGICAL (undo is ⌘Z regardless of layout), so
// the physical-code exclusion table above misses them on non-QWERTY layouts
// (e.g. ⌘Z undo on AZERTY is physical KeyW, which collides with the app's
// CLOSE_PANE chord). Match the produced character (`input.key`) for this
// family instead — Electron reports the character the OS layout produces,
// which is exactly what the guest page's own editing shortcuts act on.
//
// Shift-gated chords are NOT guest editing shortcuts: ⌘⇧C is the app's
// COPY_PATH and must keep forwarding (the guest's copy is plain ⌘C).
const GUEST_EDITING_KEYS = new Set(["a", "c", "v", "x", "z"]);

function isGuestEditingShortcut(input: BrowserPaneInput): boolean {
	if (!(input.meta || input.control)) return false;
	if (input.shift) return false;
	const key = (input.key ?? "").toLowerCase();
	return GUEST_EDITING_KEYS.has(key);
}

/**
 * True if `input` must stay with the guest page (its own editing / find /
 * print shortcuts) rather than be claimed as an app chord.
 */
export function isGuestOwnedShortcut(input: BrowserPaneInput): boolean {
	if (isGuestEditingShortcut(input)) return true;
	const chord = inputToChord(input);
	return chord !== null && BROWSER_PANE_EXCLUDED_CHORDS.has(chord);
}

// Inverse of `normalizeToken`: canonical token → DOM `KeyboardEvent.code`.
// Only the shapes the registry produces (letters, digits, named keys,
// F-keys, punctuation) are mapped; anything else falls back to a
// best-effort capitalized form.
const NAMED_CODE: Record<string, string> = {
	arrowup: "ArrowUp",
	arrowdown: "ArrowDown",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	backspace: "Backspace",
	tab: "Tab",
	enter: "Enter",
	escape: "Escape",
	space: "Space",
	delete: "Delete",
	insert: "Insert",
	home: "Home",
	end: "End",
	pageup: "PageUp",
	pagedown: "PageDown",
	slash: "Slash",
	backslash: "Backslash",
	comma: "Comma",
	period: "Period",
	semicolon: "Semicolon",
	quote: "Quote",
	backquote: "Backquote",
	minus: "Minus",
	equal: "Equal",
	bracketleft: "BracketLeft",
	bracketright: "BracketRight",
};

export function tokenToCode(token: string): string {
	if (/^[a-z]$/.test(token)) return `Key${token.toUpperCase()}`;
	if (/^[0-9]$/.test(token)) return `Digit${token}`;
	if (/^f([1-9]|1[0-2])$/.test(token)) return token.toUpperCase();
	const named = NAMED_CODE[token];
	if (named) return named;
	if (!token) return "";
	return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Build the DOM KeyboardEventInit for a canonical app chord, so the renderer
 * can re-dispatch it and let the normal focus-scoped react-hotkeys-hook
 * registrations resolve it (the same way they do when the host document has
 * focus). Pure — testable without a DOM. Mirror of {@link eventToChord}.
 */
export function chordToEventInit(chord: string): KeyboardEventInit | null {
	const canonical = canonicalizeChord(chord);
	const parts = canonical.split("+");
	const keyToken = parts.find((p) => !MODIFIERS.has(p));
	if (!keyToken) return null;
	const has = (mod: string) => parts.includes(mod);

	const code = tokenToCode(keyToken);
	return {
		code,
		key: code === "Space" ? " " : keyToken,
		metaKey: has("meta"),
		ctrlKey: has("ctrl") || has("control"),
		altKey: has("alt"),
		shiftKey: has("shift"),
		bubbles: true,
		cancelable: true,
		composed: true,
	};
}

/**
 * Build a synthetic DOM KeyboardEvent for a canonical app chord. DOM-only
 * wrapper around {@link chordToEventInit} — do not call in bun:test without
 * a DOM environment.
 */
export function dispatchChordEvent(chord: string): KeyboardEvent | null {
	const init = chordToEventInit(chord);
	if (!init) return null;
	return new KeyboardEvent("keydown", init);
}
