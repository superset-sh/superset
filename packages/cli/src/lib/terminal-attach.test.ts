import { describe, expect, test } from "bun:test";
import { attachTerminal, interruptIn, splitAtDetach } from "./terminal-attach";

describe("splitAtDetach", () => {
	test("forwards bytes typed before the detach key and drops the rest", () => {
		expect(splitAtDetach("ls\r\x1dexit\r")).toEqual({
			input: "ls\r",
			detach: true,
		});
		expect(splitAtDetach("\x03")).toEqual({ input: "\x03", detach: false });
	});
});

describe("interruptIn", () => {
	test("finds Ctrl+C anywhere in a chunk, but Esc only on its own", () => {
		expect(interruptIn("\x03ls\r")).toBe("\x03");
		expect(interruptIn("\x1b")).toBe("\x1b");
		expect(interruptIn("\x1b[A")).toBeNull();
	});
});

describe("attachTerminal", () => {
	test("a stop that came before the call ends it without connecting", async () => {
		const stopped = new AbortController();
		stopped.abort();
		expect(
			await attachTerminal({
				url: "ws://127.0.0.1:9/never",
				signal: stopped.signal,
			}),
		).toEqual({ reason: "detached" });
	});
});
