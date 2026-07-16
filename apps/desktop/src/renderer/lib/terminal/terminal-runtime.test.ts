import { beforeEach, describe, expect, test } from "bun:test";
import {
	loadRestorableState,
	PERSISTED_REPLAY_ANCHOR_BYTES,
	persistState,
} from "./terminal-runtime";

function createPersistableTerminal() {
	return {
		terminal: { cols: 101, rows: 27 } as Parameters<typeof persistState>[1],
		serializeAddon: {
			serialize: () => "prompt",
		} as unknown as Parameters<typeof persistState>[2],
	};
}

describe("terminal runtime persistence recovery", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test("restores a legacy atomic v2 snapshot with an empty checkpoint", () => {
		localStorage.setItem("terminal-state-v2:t1", "v2;101;27\nprompt");

		expect(loadRestorableState("t1")).toEqual({
			cols: 101,
			rows: 27,
			data: "prompt",
			replayCheckpoint: new Uint8Array(),
		});
	});

	test("round-trips the xterm snapshot and raw checkpoint in one v3 record", () => {
		const { terminal, serializeAddon } = createPersistableTerminal();
		const checkpoint = Uint8Array.from([0, 0x1b, 0xc3, 0xa9, 0xff]);

		expect(persistState("t1", terminal, serializeAddon, checkpoint)).toBe(true);
		expect(loadRestorableState("t1")).toEqual({
			cols: 101,
			rows: 27,
			data: "prompt",
			replayCheckpoint: checkpoint,
		});
		expect(localStorage.getItem("terminal-state-v2:t1")).toStartWith(
			"v3;101;27;",
		);
	});

	test("bounds persisted anchors within the measured 36-session localStorage budget", () => {
		const { terminal, serializeAddon } = createPersistableTerminal();
		const checkpoint = new Uint8Array(64 * 1024);
		for (let index = 0; index < checkpoint.byteLength; index += 1) {
			checkpoint[index] = index % 251;
		}

		expect(persistState("t1", terminal, serializeAddon, checkpoint)).toBe(true);
		const restored = loadRestorableState("t1");
		expect(restored?.replayCheckpoint.byteLength).toBe(
			PERSISTED_REPLAY_ANCHOR_BYTES,
		);
		expect(restored?.replayCheckpoint).toEqual(
			checkpoint.slice(-PERSISTED_REPLAY_ANCHOR_BYTES),
		);

		const raw = localStorage.getItem("terminal-state-v2:t1") ?? "";
		const v3HeaderChars = raw.indexOf("\n") + 1;
		const legacyHeaderChars = "v2;101;27\n".length;
		const addedCharsPerSession = v3HeaderChars - legacyHeaderChars;
		const projectedUtf16Bytes = (2_122_751 + 36 * addedCharsPerSession) * 2;
		expect(projectedUtf16Bytes).toBeLessThan(5 * 1024 * 1024);
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

	test("reports atomic success even when both legacy backup writes fail", () => {
		const originalSetItem = localStorage.setItem;
		const attemptedKeys: string[] = [];
		localStorage.setItem = (key, value) => {
			attemptedKeys.push(key);
			if (!key.startsWith("terminal-state-v2:")) {
				throw new DOMException("storage full", "QuotaExceededError");
			}
			originalSetItem.call(localStorage, key, value);
		};
		const { terminal, serializeAddon } = createPersistableTerminal();

		try {
			expect(persistState("t1", terminal, serializeAddon)).toBe(true);
			expect(localStorage.getItem("terminal-state-v2:t1")).toBe(
				"v3;101;27;\nprompt",
			);
			expect(attemptedKeys).toEqual([
				"terminal-state-v2:t1",
				"terminal-buffer:t1",
				"terminal-dims:t1",
			]);
		} finally {
			localStorage.setItem = originalSetItem;
		}
	});

	test("reports failure when the atomic state write is rejected", () => {
		const originalSetItem = localStorage.setItem;
		const attemptedKeys: string[] = [];
		localStorage.setItem = (key, value) => {
			attemptedKeys.push(key);
			if (key.startsWith("terminal-state-v2:")) {
				throw new DOMException("storage full", "QuotaExceededError");
			}
			originalSetItem.call(localStorage, key, value);
		};
		const { terminal, serializeAddon } = createPersistableTerminal();

		try {
			expect(persistState("t1", terminal, serializeAddon)).toBe(false);
			expect(attemptedKeys).toEqual(["terminal-state-v2:t1"]);
			expect(localStorage.getItem("terminal-buffer:t1")).toBeNull();
			expect(localStorage.getItem("terminal-dims:t1")).toBeNull();
		} finally {
			localStorage.setItem = originalSetItem;
		}
	});
});
