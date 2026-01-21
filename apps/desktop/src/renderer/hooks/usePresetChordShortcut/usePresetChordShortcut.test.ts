import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DEFAULT_CHORD_TIMEOUT_MS } from "shared/constants";
import { matchesHotkeyEvent } from "shared/hotkeys";

/**
 * Tests for the preset chord shortcut behavior.
 *
 * The chord shortcut works as follows:
 * 1. User presses NEW_GROUP hotkey (e.g., Cmd+T)
 * 2. System enters "chord waiting" state for DEFAULT_CHORD_TIMEOUT_MS (500ms)
 * 3. If user presses 1-9 within timeout, opens tab with that preset
 * 4. If user presses Escape, cancels chord without action
 * 5. If timeout expires, opens tab with default preset
 * 6. Any other key cancels the chord without action
 */

function createKeyboardEvent(
	key: string,
	options: Partial<KeyboardEvent> = {},
): KeyboardEvent {
	return {
		key,
		code: `Key${key.toUpperCase()}`,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		preventDefault: mock(() => {}),
		stopPropagation: mock(() => {}),
		...options,
	} as unknown as KeyboardEvent;
}

describe("usePresetChordShortcut behavior", () => {
	describe("NEW_GROUP hotkey detection", () => {
		it("matches meta+t on macOS as NEW_GROUP", () => {
			const event = createKeyboardEvent("t", { metaKey: true });
			expect(matchesHotkeyEvent(event, "meta+t")).toBe(true);
		});

		it("does not match t without modifier", () => {
			const event = createKeyboardEvent("t");
			expect(matchesHotkeyEvent(event, "meta+t")).toBe(false);
		});

		it("does not match meta+other key", () => {
			const event = createKeyboardEvent("k", { metaKey: true });
			expect(matchesHotkeyEvent(event, "meta+t")).toBe(false);
		});
	});

	describe("number key detection for preset selection", () => {
		it("detects keys 1-9 as valid preset selectors", () => {
			const validKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
			for (const key of validKeys) {
				expect(key >= "1" && key <= "9").toBe(true);
			}
		});

		it("rejects 0 as invalid preset selector", () => {
			const key = "0";
			expect(key >= "1" && key <= "9").toBe(false);
		});

		it("rejects non-numeric keys as preset selectors", () => {
			const invalidKeys = ["a", "z", "!", "@", " ", "Enter", "Tab"];
			for (const key of invalidKeys) {
				expect(key >= "1" && key <= "9").toBe(false);
			}
		});
	});

	describe("escape key detection", () => {
		it("detects Escape key", () => {
			const event = createKeyboardEvent("Escape");
			expect(event.key).toBe("Escape");
		});
	});

	describe("preset index calculation", () => {
		it("converts key 1 to preset index 0", () => {
			const key = "1";
			const presetIndex = parseInt(key, 10) - 1;
			expect(presetIndex).toBe(0);
		});

		it("converts key 9 to preset index 8", () => {
			const key = "9";
			const presetIndex = parseInt(key, 10) - 1;
			expect(presetIndex).toBe(8);
		});

		it("converts all keys 1-9 to correct indices", () => {
			for (let i = 1; i <= 9; i++) {
				const key = String(i);
				const presetIndex = parseInt(key, 10) - 1;
				expect(presetIndex).toBe(i - 1);
			}
		});
	});
});

describe("chord state machine logic", () => {
	type ChordState = "idle" | "waiting";

	interface ChordStateMachine {
		state: ChordState;
		transition: (event: KeyboardEvent, newGroupKeys: string) => ChordAction;
	}

	type ChordAction =
		| { type: "start_chord" }
		| { type: "open_preset"; index: number }
		| { type: "open_default" }
		| { type: "cancel" }
		| { type: "ignore" };

	function createChordStateMachine(): ChordStateMachine {
		let state: ChordState = "idle";

		return {
			get state() {
				return state;
			},
			transition(event: KeyboardEvent, newGroupKeys: string): ChordAction {
				if (state === "waiting") {
					const key = event.key;

					if (key >= "1" && key <= "9") {
						state = "idle";
						return { type: "open_preset", index: parseInt(key, 10) - 1 };
					}

					if (key === "Escape") {
						state = "idle";
						return { type: "cancel" };
					}

					state = "idle";
					return { type: "cancel" };
				}

				if (matchesHotkeyEvent(event, newGroupKeys)) {
					state = "waiting";
					return { type: "start_chord" };
				}

				return { type: "ignore" };
			},
		};
	}

	let machine: ChordStateMachine;

	beforeEach(() => {
		machine = createChordStateMachine();
	});

	it("starts in idle state", () => {
		expect(machine.state).toBe("idle");
	});

	it("transitions to waiting on NEW_GROUP hotkey", () => {
		const event = createKeyboardEvent("t", { metaKey: true });
		const action = machine.transition(event, "meta+t");

		expect(action.type).toBe("start_chord");
		expect(machine.state).toBe("waiting");
	});

	it("stays idle on non-NEW_GROUP key", () => {
		const event = createKeyboardEvent("k", { metaKey: true });
		const action = machine.transition(event, "meta+t");

		expect(action.type).toBe("ignore");
		expect(machine.state).toBe("idle");
	});

	it("opens preset on number key while waiting", () => {
		const triggerEvent = createKeyboardEvent("t", { metaKey: true });
		machine.transition(triggerEvent, "meta+t");
		expect(machine.state).toBe("waiting");

		const numberEvent = createKeyboardEvent("3");
		const action = machine.transition(numberEvent, "meta+t");

		expect(action).toEqual({ type: "open_preset", index: 2 });
		expect(machine.state).toBe("idle");
	});

	it("cancels chord on Escape while waiting", () => {
		const triggerEvent = createKeyboardEvent("t", { metaKey: true });
		machine.transition(triggerEvent, "meta+t");
		expect(machine.state).toBe("waiting");

		const escapeEvent = createKeyboardEvent("Escape");
		const action = machine.transition(escapeEvent, "meta+t");

		expect(action.type).toBe("cancel");
		expect(machine.state).toBe("idle");
	});

	it("cancels chord on other key while waiting", () => {
		const triggerEvent = createKeyboardEvent("t", { metaKey: true });
		machine.transition(triggerEvent, "meta+t");
		expect(machine.state).toBe("waiting");

		const otherEvent = createKeyboardEvent("a");
		const action = machine.transition(otherEvent, "meta+t");

		expect(action.type).toBe("cancel");
		expect(machine.state).toBe("idle");
	});

	it("handles all preset numbers 1-9", () => {
		for (let i = 1; i <= 9; i++) {
			machine = createChordStateMachine();

			const triggerEvent = createKeyboardEvent("t", { metaKey: true });
			machine.transition(triggerEvent, "meta+t");

			const numberEvent = createKeyboardEvent(String(i));
			const action = machine.transition(numberEvent, "meta+t");

			expect(action).toEqual({ type: "open_preset", index: i - 1 });
		}
	});

	it("does not trigger on number keys in idle state", () => {
		const numberEvent = createKeyboardEvent("1");
		const action = machine.transition(numberEvent, "meta+t");

		expect(action.type).toBe("ignore");
		expect(machine.state).toBe("idle");
	});
});

describe("timeout behavior", () => {
	it("uses default chord timeout from constants", () => {
		expect(DEFAULT_CHORD_TIMEOUT_MS).toBe(500);
	});

	it("timeout triggers default tab open (conceptual)", async () => {
		let timeoutTriggered = false;
		setTimeout(() => {
			timeoutTriggered = true;
		}, DEFAULT_CHORD_TIMEOUT_MS);

		await new Promise((resolve) =>
			setTimeout(resolve, DEFAULT_CHORD_TIMEOUT_MS + 50),
		);

		expect(timeoutTriggered).toBe(true);
	});

	it("clearing timeout prevents default action (conceptual)", async () => {
		let timeoutTriggered = false;
		const timeout = setTimeout(() => {
			timeoutTriggered = true;
		}, DEFAULT_CHORD_TIMEOUT_MS);

		clearTimeout(timeout);

		await new Promise((resolve) =>
			setTimeout(resolve, DEFAULT_CHORD_TIMEOUT_MS + 50),
		);

		expect(timeoutTriggered).toBe(false);
	});
});

describe("preset bounds checking", () => {
	const MAX_VISIBLE_PRESETS = 9;

	it("limits visible presets to 9", () => {
		expect(MAX_VISIBLE_PRESETS).toBe(9);
	});

	it("handles preset array slicing correctly", () => {
		const presets = Array.from({ length: 15 }, (_, i) => ({
			id: `preset-${i}`,
			name: `Preset ${i + 1}`,
		}));

		const visiblePresets = presets.slice(0, MAX_VISIBLE_PRESETS);
		expect(visiblePresets.length).toBe(9);
		expect(visiblePresets[0].id).toBe("preset-0");
		expect(visiblePresets[8].id).toBe("preset-8");
	});

	it("handles fewer presets than max", () => {
		const presets = Array.from({ length: 3 }, (_, i) => ({
			id: `preset-${i}`,
			name: `Preset ${i + 1}`,
		}));

		const visiblePresets = presets.slice(0, MAX_VISIBLE_PRESETS);
		expect(visiblePresets.length).toBe(3);
	});

	it("handles empty presets array", () => {
		const presets: { id: string; name: string }[] = [];
		const visiblePresets = presets.slice(0, MAX_VISIBLE_PRESETS);
		expect(visiblePresets.length).toBe(0);
	});
});
