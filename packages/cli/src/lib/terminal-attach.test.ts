import { describe, expect, test } from "bun:test";
import { splitAtDetach } from "./terminal-attach";

describe("splitAtDetach", () => {
	test("forwards bytes typed before the detach key and drops the rest", () => {
		expect(splitAtDetach("ls\r\x1dexit\r")).toEqual({
			input: "ls\r",
			detach: true,
		});
		expect(splitAtDetach("\x03")).toEqual({ input: "\x03", detach: false });
	});
});
