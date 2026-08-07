import { beforeEach, describe, expect, test } from "bun:test";
import type { BrowserWindow } from "electron";
import {
	__resetForTests,
	getAllWindows,
	getEntry,
	getFocusedOrLastWindow,
	getOrg,
	markFocused,
	registerWindow,
	setOrg,
	unregisterWindow,
} from "./window-registry";

/**
 * Minimal BrowserWindow stand-in. The registry only ever touches `id` and
 * `isDestroyed()`, so a plain object cast to BrowserWindow is sufficient and
 * keeps these tests free of the Electron runtime.
 */
function makeWindow(id: number, destroyed = false): BrowserWindow {
	let isDestroyed = destroyed;
	return {
		id,
		isDestroyed: () => isDestroyed,
		__destroy: () => {
			isDestroyed = true;
		},
	} as unknown as BrowserWindow & { __destroy: () => void };
}

beforeEach(() => {
	__resetForTests();
});

describe("window registry", () => {
	test("register then read entry and org", () => {
		const win = makeWindow(1);
		registerWindow({ window: win, orgId: "org-a" });
		expect(getEntry(1)?.window).toBe(win);
		expect(getOrg(1)).toBe("org-a");
	});

	test("registering with null org returns null org", () => {
		registerWindow({ window: makeWindow(2), orgId: null });
		expect(getOrg(2)).toBeNull();
	});

	test("setOrg updates an existing entry", () => {
		registerWindow({ window: makeWindow(1), orgId: "org-a" });
		setOrg({ windowId: 1, orgId: "org-b" });
		expect(getOrg(1)).toBe("org-b");
	});

	test("setOrg on unknown window is a no-op", () => {
		setOrg({ windowId: 99, orgId: "org-x" });
		expect(getOrg(99)).toBeNull();
	});

	test("unregister removes the entry", () => {
		registerWindow({ window: makeWindow(1), orgId: "org-a" });
		unregisterWindow(1);
		expect(getEntry(1)).toBeUndefined();
		expect(getOrg(1)).toBeNull();
	});

	test("getAllWindows returns only live windows", () => {
		const live = makeWindow(1);
		const dead = makeWindow(2) as BrowserWindow & { __destroy: () => void };
		registerWindow({ window: live, orgId: null });
		registerWindow({ window: dead, orgId: null });
		dead.__destroy();
		expect(getAllWindows()).toEqual([live]);
	});

	test("getFocusedOrLastWindow prefers the most-recently-focused live window", () => {
		const a = makeWindow(1);
		const b = makeWindow(2);
		registerWindow({ window: a, orgId: null });
		registerWindow({ window: b, orgId: null });
		// b registered last -> currently most recent
		expect(getFocusedOrLastWindow()).toBe(b);
		markFocused(1);
		expect(getFocusedOrLastWindow()).toBe(a);
	});

	test("getFocusedOrLastWindow skips destroyed windows", () => {
		const a = makeWindow(1);
		const b = makeWindow(2) as BrowserWindow & { __destroy: () => void };
		registerWindow({ window: a, orgId: null });
		registerWindow({ window: b, orgId: null });
		b.__destroy(); // most-recent but dead
		expect(getFocusedOrLastWindow()).toBe(a);
	});

	test("getFocusedOrLastWindow returns null with no live windows", () => {
		expect(getFocusedOrLastWindow()).toBeNull();
		const a = makeWindow(1);
		registerWindow({ window: a, orgId: null });
		unregisterWindow(1);
		expect(getFocusedOrLastWindow()).toBeNull();
	});

	test("markFocused on unknown window does not add it", () => {
		markFocused(42);
		expect(getFocusedOrLastWindow()).toBeNull();
	});
});
