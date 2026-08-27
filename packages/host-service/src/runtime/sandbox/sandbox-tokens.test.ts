import { afterEach, describe, expect, test } from "bun:test";
import {
	dropHookToken,
	getOrCreateHookToken,
	resetHookTokensForTests,
	verifyHookToken,
} from "./sandbox-tokens.ts";

describe("sandbox hook tokens", () => {
	afterEach(() => {
		resetHookTokensForTests();
	});

	test("stable per workspace and distinct across workspaces", () => {
		const a = getOrCreateHookToken("ws-a");
		expect(getOrCreateHookToken("ws-a")).toBe(a);
		expect(getOrCreateHookToken("ws-b")).not.toBe(a);
	});

	test("verification passes when no token is registered", () => {
		// No token registered (host workspace, pre-update script): all pass.
		expect(verifyHookToken("ws-none", undefined)).toBe(true);
		expect(verifyHookToken("ws-none", "whatever")).toBe(true);
	});

	test("verification requires a matching token once one is registered", () => {
		const token = getOrCreateHookToken("ws-a");
		// A registered workspace rejects both a missing and a wrong token.
		expect(verifyHookToken("ws-a", undefined)).toBe(false);
		expect(verifyHookToken("ws-a", "wrong")).toBe(false);
		expect(verifyHookToken("ws-a", `${token}x`)).toBe(false);
		expect(verifyHookToken("ws-a", token)).toBe(true);
	});

	test("dropped tokens stop constraining verification", () => {
		getOrCreateHookToken("ws-a");
		dropHookToken("ws-a");
		expect(verifyHookToken("ws-a", "anything")).toBe(true);
	});
});
