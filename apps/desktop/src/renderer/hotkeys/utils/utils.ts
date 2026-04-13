import {
	eventToChord,
	TERMINAL_RESERVED_CHORDS,
} from "./resolveHotkeyFromEvent";

/** True if the event matches a chord the terminal must always receive. */
export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
	const chord = eventToChord(event);
	if (!chord) return false;
	return TERMINAL_RESERVED_CHORDS.has(chord);
}
