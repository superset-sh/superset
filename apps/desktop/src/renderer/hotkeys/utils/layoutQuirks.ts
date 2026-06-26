// Per-layout quirks the renderer must compensate for. Kept dependency-free
// so it can be imported from both binding.ts and display.ts without
// participating in the existing binding ↔ resolveHotkeyFromEvent cycle.

// macOS layouts where holding ⌘ reverts the keyboard to QWERTY semantics
// (issue #4674). native-keymap still reports the no-modifier (Dvorak) glyph
// map for these, so naïve layout translation maps logical ⌘+s → physical
// KeyO and the binding never fires. For these layouts we keep logical meta
// chords on their QWERTY scan code at dispatch time, and skip the
// layout-glyph lookup at display time. Non-meta chords (Ctrl, Alt) still
// follow the OS layout.
const CMD_REVERTS_TO_QWERTY_LAYOUTS = new Set<string>([
	"com.apple.keylayout.DVORAK-QWERTYCMD",
]);

export function metaRevertsToQwerty(layoutId: string | null): boolean {
	if (!layoutId) return false;
	return CMD_REVERTS_TO_QWERTY_LAYOUTS.has(layoutId);
}
