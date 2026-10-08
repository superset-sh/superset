import { describe, expect, test } from "bun:test";
import type { BrowserWindow } from "electron";
import { openInitialWindow } from "./open-initial-window";

const fakeWindow = (id: number) => ({ id }) as unknown as BrowserWindow;

function harness(restored: BrowserWindow[]) {
	const calls: string[] = [];
	const windows: BrowserWindow[] = [];
	return {
		calls,
		deps: {
			guardWebContents: () => calls.push("guard"),
			restoreWindows: async () => {
				calls.push("restore");
				windows.push(...restored);
			},
			getAllWindows: () => windows,
			createWindow: async () => {
				calls.push("create");
				const window = fakeWindow(99);
				windows.push(window);
				return window;
			},
		},
	};
}

describe("openInitialWindow", () => {
	test("guards web contents before restoring windows", async () => {
		const { calls, deps } = harness([fakeWindow(1)]);
		const window = await openInitialWindow(deps);
		expect(calls).toEqual(["guard", "restore"]);
		expect(window.id).toBe(1);
	});

	test("guards web contents before creating the first window", async () => {
		const { calls, deps } = harness([]);
		const window = await openInitialWindow(deps);
		expect(calls).toEqual(["guard", "restore", "create"]);
		expect(window.id).toBe(99);
	});
});
