import { describe, expect, test } from "bun:test";
import { hostStartsChats } from "./hostStartsChats";

describe("hostStartsChats", () => {
	test("only hosts at or above the release that starts chats", () => {
		expect(hostStartsChats("1.36.0")).toBe(false);
		expect(hostStartsChats("1.37.0")).toBe(true);
		expect(hostStartsChats("1.37.0-canary.20261007")).toBe(true);
		expect(hostStartsChats("2.0.0")).toBe(true);
		expect(hostStartsChats(null)).toBe(false);
		expect(hostStartsChats("dev")).toBe(false);
	});
});
