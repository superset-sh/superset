import { describe, expect, mock, test } from "bun:test";

class FakeKeyboardEvent {
	type: string;
	init: KeyboardEventInit;
	constructor(type: string, init: KeyboardEventInit) {
		this.type = type;
		this.init = init;
	}
}
(globalThis as unknown as Record<string, unknown>).KeyboardEvent =
	FakeKeyboardEvent;
const dispatchEvent = mock((_event: FakeKeyboardEvent) => true);
(document as unknown as Record<string, unknown>).dispatchEvent = dispatchEvent;

const { getForwardableChords, replayForwardedKey } = await import(
	"./forwardedHotkeys"
);

const key = (overrides: Partial<Parameters<typeof replayForwardedKey>[0]>) => ({
	key: "w",
	code: "KeyW",
	meta: true,
	control: false,
	alt: false,
	shift: false,
	...overrides,
});

describe("forwardedHotkeys", () => {
	test("the synced chord set covers closing the pane and tab switching", () => {
		const chords = getForwardableChords();
		expect(chords).toContain("meta+w");
		expect(chords).toContain("alt+meta+arrowright");
		expect(chords).not.toContain("meta+c");
	});

	test("replays a forwardable chord as a keydown/keyup pair on the document", () => {
		dispatchEvent.mockClear();
		expect(replayForwardedKey(key({}))).toBe(true);
		const dispatched = dispatchEvent.mock.calls.map(([event]) => event);
		expect(dispatched.map((event) => event.type)).toEqual(["keydown", "keyup"]);
		expect(dispatched[0]?.init).toMatchObject({
			key: "w",
			code: "KeyW",
			metaKey: true,
			ctrlKey: false,
			bubbles: true,
		});
	});

	test("drops a chord outside the forwardable set", () => {
		dispatchEvent.mockClear();
		expect(replayForwardedKey(key({ key: "c", code: "KeyC" }))).toBe(false);
		expect(dispatchEvent).not.toHaveBeenCalled();
	});
});
