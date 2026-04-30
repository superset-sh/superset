import { describe, expect, it } from "bun:test";
import {
	clearInteractiveInputState,
	consumeInteractiveCommand,
	createInteractiveInputState,
	recordInteractiveInput,
} from "./interactive-input-tracker";

describe("interactive input tracker", () => {
	it("captures a submitted command line", () => {
		const state = createInteractiveInputState();
		recordInteractiveInput(state, "echo hello\r");
		expect(consumeInteractiveCommand(state)).toBe("echo hello");
	});

	it("handles backspace and ctrl-u edits", () => {
		const state = createInteractiveInputState();
		recordInteractiveInput(state, "echo hellp\x7fo\r");
		recordInteractiveInput(state, "wrong\x15echo reset\r");
		expect(consumeInteractiveCommand(state)).toBe("echo hello");
		expect(consumeInteractiveCommand(state)).toBe("echo reset");
	});

	it("captures pasted multiline commands in order", () => {
		const state = createInteractiveInputState();
		recordInteractiveInput(state, "echo one\necho two\n");
		expect(consumeInteractiveCommand(state)).toBe("echo one");
		expect(consumeInteractiveCommand(state)).toBe("echo two");
	});

	it("ignores terminal escape sequences from navigation keys", () => {
		const state = createInteractiveInputState();
		recordInteractiveInput(state, "echo \x1b[Ahello\r");
		expect(consumeInteractiveCommand(state)).toBe("echo hello");
	});

	it("does not emit empty submitted lines", () => {
		const state = createInteractiveInputState();
		recordInteractiveInput(state, "\r\n");
		expect(consumeInteractiveCommand(state)).toBeNull();
	});

	it("caps queued submitted commands", () => {
		const state = createInteractiveInputState();
		for (let index = 0; index < 20; index += 1) {
			recordInteractiveInput(state, `echo ${index}\r`);
		}

		expect(state.submittedCommands).toHaveLength(16);
		expect(consumeInteractiveCommand(state)).toBe("echo 4");
	});

	it("clears tracked input state", () => {
		const state = createInteractiveInputState();
		recordInteractiveInput(state, "echo pending");
		recordInteractiveInput(state, "echo queued\r");

		clearInteractiveInputState(state);

		expect(state.line).toBe("");
		expect(state.submittedCommands).toEqual([]);
		expect(state.escapeSequence).toBeNull();
	});
});
