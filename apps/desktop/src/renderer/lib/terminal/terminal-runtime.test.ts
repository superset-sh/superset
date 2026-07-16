import { beforeEach, describe, expect, test } from "bun:test";
import { loadRestorableState } from "./terminal-runtime";

describe("terminal runtime persistence recovery", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test("restores a valid atomic v2 snapshot", () => {
		localStorage.setItem("terminal-state-v2:t1", "v2;101;27\nprompt");

		expect(loadRestorableState("t1")).toEqual({
			cols: 101,
			rows: 27,
			data: "prompt",
		});
	});

	test("rejects an empty atomic snapshot so the daemon can replay", () => {
		localStorage.setItem("terminal-state-v2:t1", "v2;101;27\n\u001b[0m   ");

		expect(loadRestorableState("t1")).toBeNull();
	});

	test("rejects a corrupt atomic snapshot so the daemon can replay", () => {
		localStorage.setItem("terminal-state-v2:t1", "v2;broken\nprompt");

		expect(loadRestorableState("t1")).toBeNull();
	});

	test("rejects a low-content legacy snapshot when recovery is absent", () => {
		localStorage.setItem("terminal-buffer:t1", "stale prompt");

		expect(loadRestorableState("t1")).toBeNull();
	});
});
