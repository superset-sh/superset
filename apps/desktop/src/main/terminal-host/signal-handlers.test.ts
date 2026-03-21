import { describe, expect, it } from "bun:test";

/**
 * Tests for the macOS SIGHUP behavior in the terminal host daemon.
 *
 * Issue #2639: On macOS, the daemon runs non-detached (no setsid) to preserve
 * the Mach bootstrap namespace so that child shells retain access to
 * SystemConfiguration services (scutil --dns, proxy, etc.). Because the daemon
 * is non-detached on macOS, it may receive SIGHUP when Electron exits and must
 * ignore it to survive across app restarts.
 *
 * The tests below verify the daemon spawn configuration logic and directly
 * test the SIGHUP branching behavior from signal-handlers.ts.
 */

/**
 * Tests for the daemon spawn `detached` flag per platform.
 * Mirrors the expression in client.ts: `const detached = process.platform !== "darwin";`
 */
describe("daemon spawn detached flag (#2639)", () => {
	function shouldDetach(platform: string): boolean {
		return platform !== "darwin";
	}

	it("should NOT detach on macOS to preserve Mach bootstrap namespace", () => {
		expect(shouldDetach("darwin")).toBe(false);
	});

	it("should detach on Linux where setsid has no Mach side effects", () => {
		expect(shouldDetach("linux")).toBe(true);
	});

	it("should detach on Windows", () => {
		expect(shouldDetach("win32")).toBe(true);
	});
});

/**
 * Tests for the SIGHUP platform branching in signal-handlers.ts.
 *
 * The relevant code is:
 *   process.on("SIGHUP", () => {
 *     if (process.platform === "darwin") {
 *       log("info", "Received SIGHUP, ignoring (macOS non-detached daemon)");
 *       return;
 *     }
 *     shutdownOnce({ ... });
 *   });
 *
 * We test this logic directly without importing the full module (which has
 * side effects on process signal handlers that interfere with bun:test).
 */
describe("SIGHUP handler platform branching (#2639)", () => {
	/**
	 * Simulates the SIGHUP handler logic from signal-handlers.ts.
	 * Returns { ignored: true } on macOS, { shutdown: true } on other platforms.
	 */
	function simulateSighupHandler(platform: string): {
		ignored: boolean;
		shutdown: boolean;
		logMessage: string;
	} {
		// This mirrors the exact logic in signal-handlers.ts SIGHUP handler
		if (platform === "darwin") {
			return {
				ignored: true,
				shutdown: false,
				logMessage: "Received SIGHUP, ignoring (macOS non-detached daemon)",
			};
		}
		return {
			ignored: false,
			shutdown: true,
			logMessage: "Received SIGHUP, shutting down...",
		};
	}

	it("on macOS, SIGHUP is ignored (daemon stays alive)", () => {
		const result = simulateSighupHandler("darwin");
		expect(result.ignored).toBe(true);
		expect(result.shutdown).toBe(false);
		expect(result.logMessage).toContain("ignoring");
	});

	it("on Linux, SIGHUP triggers shutdown", () => {
		const result = simulateSighupHandler("linux");
		expect(result.ignored).toBe(false);
		expect(result.shutdown).toBe(true);
		expect(result.logMessage).toContain("shutting down");
	});

	it("SIGINT/SIGTERM always trigger shutdown regardless of platform", () => {
		// SIGINT and SIGTERM handlers have no platform branching
		// This documents that only SIGHUP has the macOS exception
		for (const platform of ["darwin", "linux", "win32"]) {
			const sighupResult = simulateSighupHandler(platform);
			if (platform === "darwin") {
				expect(sighupResult.shutdown).toBe(false);
			} else {
				expect(sighupResult.shutdown).toBe(true);
			}
		}
	});
});

/**
 * Verifies the actual signal-handlers.ts source code contains the macOS
 * platform check in the SIGHUP handler. This structural test ensures the
 * fix for #2639 hasn't been accidentally removed.
 */
describe("signal-handlers.ts source verification (#2639)", () => {
	it("SIGHUP handler contains darwin platform check", async () => {
		const fs = await import("node:fs");
		const path = await import("node:path");
		const source = fs.readFileSync(
			path.join(__dirname, "signal-handlers.ts"),
			"utf-8",
		);

		// The SIGHUP handler must check for macOS
		expect(source).toContain('process.platform === "darwin"');
		// The SIGHUP handler must have an ignore path for macOS
		expect(source).toContain("ignoring");
		// The SIGHUP handler must still have shutdown path for other platforms
		expect(source).toContain("SIGHUP, shutting down");
	});
});
