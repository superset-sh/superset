import { describe, expect, test } from "bun:test";

import {
	isDesktopProtocol,
	parseLoopbackCallback,
} from "./desktopCallbackTarget";

describe("isDesktopProtocol", () => {
	test("accepts the schemes the desktop registers", () => {
		expect(isDesktopProtocol("superset")).toBe(true);
		expect(isDesktopProtocol("superset-dev")).toBe(true);
		expect(isDesktopProtocol("superset-my-worktree2")).toBe(true);
		expect(isDesktopProtocol("Superset")).toBe(true);
	});

	test("rejects anything that could redirect the token elsewhere", () => {
		expect(isDesktopProtocol("https")).toBe(false);
		expect(isDesktopProtocol("https://attacker.example/?x=")).toBe(false);
		expect(isDesktopProtocol("superset://evil")).toBe(false);
		expect(isDesktopProtocol("superset-")).toBe(false);
		expect(isDesktopProtocol("supersets")).toBe(false);
		expect(isDesktopProtocol("javascript")).toBe(false);
		expect(isDesktopProtocol("")).toBe(false);
	});
});

describe("parseLoopbackCallback", () => {
	test("accepts the desktop's loopback callback", () => {
		expect(
			parseLoopbackCallback("http://127.0.0.1:41893/auth/callback")?.href,
		).toBe("http://127.0.0.1:41893/auth/callback");
		expect(
			parseLoopbackCallback("http://localhost:3000/auth/callback")?.href,
		).toBe("http://localhost:3000/auth/callback");
	});

	test("rejects other hosts and schemes", () => {
		expect(
			parseLoopbackCallback("https://attacker.example/auth/callback"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("http://attacker.example/auth/callback"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("http://127.0.0.1.attacker.example/auth/callback"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("http://[::1]:3000/auth/callback"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("https://127.0.0.1/auth/callback"),
		).toBeUndefined();
		expect(parseLoopbackCallback("superset://auth/callback")).toBeUndefined();
		expect(parseLoopbackCallback("javascript:alert(1)")).toBeUndefined();
		expect(parseLoopbackCallback("//127.0.0.1/auth/callback")).toBeUndefined();
		expect(parseLoopbackCallback("not a url")).toBeUndefined();
		expect(parseLoopbackCallback("")).toBeUndefined();
	});

	test("rejects credentials, other paths, queries, and fragments", () => {
		expect(
			parseLoopbackCallback("http://user:pw@127.0.0.1/auth/callback"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("http://127.0.0.1@attacker.example/auth/callback"),
		).toBeUndefined();
		expect(parseLoopbackCallback("http://127.0.0.1/")).toBeUndefined();
		expect(
			parseLoopbackCallback("http://127.0.0.1/auth/callback/../other"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("http://127.0.0.1/auth/callback?x=1"),
		).toBeUndefined();
		expect(
			parseLoopbackCallback("http://127.0.0.1/auth/callback#frag"),
		).toBeUndefined();
	});
});
