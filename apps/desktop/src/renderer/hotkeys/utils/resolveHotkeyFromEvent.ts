import { electronTrpcClient } from "renderer/lib/trpc-client";
import { canonicalizeChord, eventToChord } from "shared/browser-pane-chords";
import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import { useKeyboardLayoutStore } from "../stores/keyboardLayoutStore";
import {
	getEffectiveLayoutMap,
	useKeyboardPreferencesStore,
} from "../stores/keyboardPreferencesStore";
import type { ShortcutBinding } from "../types";
import { bindingToDispatchChord } from "./binding";

export {
	canonicalizeChord,
	eventToChord,
	isIgnorableKey,
	MODIFIERS,
	normalizeToken,
} from "shared/browser-pane-chords";

/**
 * KeyboardEvent → registered {@link HotkeyId}, or `null` if unbound. Uses the
 * same `event.code` normalization as react-hotkeys-hook so the reverse index
 * can't drift from the matcher. Index reflects current overrides, not frozen
 * defaults — see {@link registeredAppChords}.
 */
export function resolveHotkeyFromEvent(event: KeyboardEvent): HotkeyId | null {
	if (event.type !== "keydown") return null;
	const chord = eventToChord(event);
	if (!chord) return null;
	return registeredAppChords.get(chord) ?? null;
}

/** True if `event` produces `chord` (tolerating modifier order / aliases). */
export function matchesChord(event: KeyboardEvent, chord: string): boolean {
	const eventChord = eventToChord(event);
	if (!eventChord) return false;
	return eventChord === canonicalizeChord(chord);
}

/** Sent straight to the PTY. Canonicalized at build time so lookups via `eventToChord` / `canonicalizeChord` match directly. */
export const TERMINAL_RESERVED_CHORDS = new Set(
	["ctrl+c", "ctrl+d", "ctrl+z", "ctrl+s", "ctrl+q", "ctrl+backslash"].map(
		canonicalizeChord,
	),
);

/** True if the event matches a chord the terminal must always receive. */
export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
	const chord = eventToChord(event);
	if (!chord) return false;
	return TERMINAL_RESERVED_CHORDS.has(chord);
}

function buildRegisteredAppChords(
	overrides: Record<string, ShortcutBinding | null>,
	layoutMap: ReadonlyMap<string, string> | null,
): Map<string, HotkeyId> {
	const map = new Map<string, HotkeyId>();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		const hasOverride = id in overrides;
		const override = hasOverride ? overrides[id] : undefined;
		// Explicit unassignment (null override) must drop from the index — else
		// the terminal's isAppHotkey check would swallow the freed chord.
		if (hasOverride && override === null) continue;
		const binding = override ?? HOTKEYS[id].key;
		if (!binding) continue;
		const dispatchChord = bindingToDispatchChord(binding, layoutMap);
		if (!dispatchChord) continue;
		map.set(canonicalizeChord(dispatchChord), id);
	}
	return map;
}

// Reassigned on each override, layout, OR adaptive-layout-toggle change;
// `let` is required so the subscribe callbacks can replace the reference
// the resolver reads. Read the layout map through `getEffectiveLayoutMap`
// so the toggle state is honored on every rebuild.
let registeredAppChords = buildRegisteredAppChords(
	useHotkeyOverridesStore.getState().overrides,
	getEffectiveLayoutMap(),
);

// Mirror the index to the main process so browser panes (guest webContents,
// out-of-process) can match the same chords in `before-input-event` and
// forward matches back for re-dispatch. Fire-and-forget: the mutation is
// cheap and the main-side set is replaced wholesale. If the IPC channel
// isn't ready yet (startup / teardown) the main-side index just stays
// empty until the next rebuild — browser-pane hotkeys degrade gracefully.
//
// On rejection, retry once with a short delay instead of dropping the
// update: the channel typically comes up within a second of the renderer
// booting, and the NEXT rebuild (override/layout change) also re-pushes,
// so a single delayed retry keeps the main-side index from staying stale
// for the whole session.
let pendingChordsRetry: ReturnType<typeof setTimeout> | null = null;

function pushAppChordsToMain(): void {
	const chords = [...registeredAppChords.keys()];
	void electronTrpcClient.browser.setAppChords
		.mutate({ chords })
		.catch((error: unknown) => {
			console.warn("Failed to push app chords to main process", error);
			if (pendingChordsRetry) return;
			pendingChordsRetry = setTimeout(() => {
				pendingChordsRetry = null;
				const latest = [...registeredAppChords.keys()];
				void electronTrpcClient.browser.setAppChords
					.mutate({ chords: latest })
					.catch((retryError: unknown) => {
						console.warn(
							"Retry: failed to push app chords to main process",
							retryError,
						);
					});
			}, 1_000);
		});
}

function rebuild() {
	registeredAppChords = buildRegisteredAppChords(
		useHotkeyOverridesStore.getState().overrides,
		getEffectiveLayoutMap(),
	);
	pushAppChordsToMain();
}
pushAppChordsToMain();
useHotkeyOverridesStore.subscribe(rebuild);
useKeyboardLayoutStore.subscribe(rebuild);
useKeyboardPreferencesStore.subscribe(rebuild);
