import { describe, expect, test } from "bun:test";
import {
	buildWindowsDeferredReplaceScript,
	cliBinaryNameForTarget,
	detectTargetFor,
	isCliSelfUpdateSupported,
} from "./command";

describe("update command platform helpers", () => {
	test("detects the Windows CLI artifact target", () => {
		expect(detectTargetFor("win32", "x64")).toBe("win32-x64");
		expect(() => detectTargetFor("win32", "arm64")).toThrow(
			"Unsupported platform: win32/arm64",
		);
	});

	test("uses the Windows executable name for Windows CLI archives", () => {
		expect(cliBinaryNameForTarget("win32-x64")).toBe("superset.exe");
		expect(cliBinaryNameForTarget("darwin-arm64")).toBe("superset");
		expect(cliBinaryNameForTarget("linux-x64")).toBe("superset");
	});

	test("leaves Windows desktop updates owned by electron-updater", () => {
		expect(isCliSelfUpdateSupported("win32")).toBe(false);
		expect(isCliSelfUpdateSupported("darwin")).toBe(true);
		expect(isCliSelfUpdateSupported("linux")).toBe(true);
	});

	test("builds a deferred Windows replacement script for locked binaries", () => {
		const script = buildWindowsDeferredReplaceScript({
			installRoot: String.raw`C:\Tools 100%\superset`,
			newRoot: String.raw`C:\Tools 100%\superset.update-1\superset-win32-x64`,
			tempDir: String.raw`C:\Tools 100%\superset.update-1`,
			parentPid: 12345,
		});

		expect(script).toContain('set "PARENT_PID=12345"');
		expect(script).toContain(
			String.raw`set "INSTALL_ROOT=C:\Tools 100%%\superset"`,
		);
		expect(script).toContain("tasklist.exe");
		expect(script).toContain('move /Y "%NEW_ROOT%" "%INSTALL_ROOT%"');
		expect(script).toContain('rmdir /S /Q "%TEMP_DIR%"');
	});
});
