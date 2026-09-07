import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { canonicalizeChord } from "shared/hotkey-chord";
import { getDispatchChord } from "../hooks/useBinding/useBinding";
import { PLATFORM } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";

const isMac = PLATFORM === "mac";

class FakeKeyboardEvent {
	type: string;
	init: KeyboardEventInit;
	constructor(type: string, init: KeyboardEventInit) {
		this.type = type;
		this.init = init;
	}
}
const dispatchEvent = mock((_event: FakeKeyboardEvent) => true);
const originalKeyboardEvent = globalThis.KeyboardEvent;
const originalDispatchEvent = document.dispatchEvent;
const originalOverrides = useHotkeyOverridesStore.getState().overrides;

beforeEach(() => {
	(globalThis as unknown as Record<string, unknown>).KeyboardEvent =
		FakeKeyboardEvent;
	(document as unknown as Record<string, unknown>).dispatchEvent =
		dispatchEvent;
	dispatchEvent.mockClear();
});

afterEach(() => {
	globalThis.KeyboardEvent = originalKeyboardEvent;
	document.dispatchEvent = originalDispatchEvent;
	useHotkeyOverridesStore.setState({ overrides: originalOverrides });
});

const { getForwardableChords, replayForwardedKey } = await import(
	"./forwardedHotkeys"
);

const key = (overrides: Partial<Parameters<typeof replayForwardedKey>[0]>) => ({
	key: "w",
	code: "KeyW",
	meta: isMac,
	control: !isMac,
	alt: false,
	shift: !isMac,
	...overrides,
});

describe("forwardedHotkeys", () => {
	test.each([
		"CLOSE_TAB",
		"REOPEN_TAB",
		"SPLIT_RIGHT",
		"SPLIT_DOWN",
		"SPLIT_AUTO",
		"SPLIT_WITH_BROWSER",
		"SPLIT_WITH_DESKTOP",
		"EQUALIZE_PANE_SPLITS",
		"TOGGLE_SIDEBAR",
		"TOGGLE_WORKSPACE_SIDEBAR",
		"NEW_GROUP",
		"NEW_BROWSER",
		"OPEN_DIFF_VIEWER",
		"QUICK_OPEN",
		"OPEN_COMMAND_PALETTE",
		"CHECK_RESOURCES",
		"NEW_WORKSPACE",
	] as const)("forwards the resolved shell binding for %s", (id) => {
		const chord = getDispatchChord(id);
		expect(chord).not.toBeNull();
		if (!chord) throw new Error(`Missing default binding for ${id}`);
		expect(getForwardableChords()).toContain(canonicalizeChord(chord));
	});

	test("replays split-right from either embedded surface", () => {
		expect(replayForwardedKey(key({ key: "d", code: "KeyD" }))).toBe(true);
		expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual([
			"keydown",
			"keyup",
		]);
	});

	test("honors remapped and explicitly unassigned shell shortcuts", () => {
		useHotkeyOverridesStore.getState().setOverride("SPLIT_RIGHT", "alt+x");
		expect(getForwardableChords()).toContain("alt+x");
		expect(replayForwardedKey(key({ key: "d", code: "KeyD" }))).toBe(false);
		expect(
			replayForwardedKey(
				key({
					key: "x",
					code: "KeyX",
					meta: false,
					control: false,
					shift: false,
					alt: true,
				}),
			),
		).toBe(true);
		useHotkeyOverridesStore.getState().setOverride("SPLIT_RIGHT", null);
		expect(getForwardableChords()).not.toContain("alt+x");
	});

	test.each([
		"FOCUS_PANE_LEFT",
		"FOCUS_PANE_RIGHT",
		"FOCUS_PANE_UP",
		"FOCUS_PANE_DOWN",
	] as const)("forwards %s when the user assigns it", (id) => {
		useHotkeyOverridesStore.getState().setOverride(id, "alt+x");
		expect(getForwardableChords()).toContain("alt+x");
	});

	test.each([
		"a",
		"c",
		"v",
		"x",
		"z",
		"f",
		"r",
	])("leaves document shortcut %s to the embedded document", (letter) => {
		expect(
			replayForwardedKey(
				key({ key: letter, code: `Key${letter.toUpperCase()}`, shift: false }),
			),
		).toBe(false);
		expect(dispatchEvent).not.toHaveBeenCalled();
	});

	test("the synced chord set covers closing the pane and tab switching", () => {
		const chords = getForwardableChords();
		expect(chords).toContain(isMac ? "meta+w" : "ctrl+shift+w");
		expect(chords).toContain(
			isMac ? "alt+meta+arrowright" : "alt+ctrl+shift+arrowright",
		);
		expect(chords).not.toContain(isMac ? "meta+c" : "ctrl+c");
	});

	test("replays a forwardable chord as a keydown/keyup pair on the document", () => {
		dispatchEvent.mockClear();
		expect(replayForwardedKey(key({}))).toBe(true);
		const dispatched = dispatchEvent.mock.calls.map(([event]) => event);
		expect(dispatched.map((event) => event.type)).toEqual(["keydown", "keyup"]);
		expect(dispatched[0]?.init).toMatchObject({
			key: "w",
			code: "KeyW",
			metaKey: isMac,
			ctrlKey: !isMac,
			shiftKey: !isMac,
			bubbles: true,
		});
	});

	test("drops a chord outside the forwardable set", () => {
		dispatchEvent.mockClear();
		expect(replayForwardedKey(key({ key: "c", code: "KeyC" }))).toBe(false);
		expect(dispatchEvent).not.toHaveBeenCalled();
	});
});
