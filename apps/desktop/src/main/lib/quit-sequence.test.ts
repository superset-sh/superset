import { describe, expect, mock, test } from "bun:test";
import {
	FULL_CLEANUP_TIMEOUT_MS,
	type QuitCleanupDeps,
	runQuitCleanup,
	UPDATE_INSTALL_EXIT_GRACE_MS,
} from "./quit-sequence";

interface Harness {
	deps: QuitCleanupDeps;
	forceExit: ReturnType<typeof mock>;
	teardownTerminalHost: ReturnType<typeof mock>;
	disposeTerminalHostClient: ReturnType<typeof mock>;
	stopHostServices: ReturnType<typeof mock>;
	stopPtyDaemons: ReturnType<typeof mock>;
	scheduled: Array<{ callback: () => void; delayMs: number }>;
}

function createHarness(overrides: Partial<QuitCleanupDeps> = {}): Harness {
	const forceExit = mock((_code: number) => {});
	const teardownTerminalHost = mock(async () => {});
	const disposeTerminalHostClient = mock(() => {});
	const stopHostServices = mock((): number[] => [101, 102]);
	const stopPtyDaemons = mock(async (_pids: number[]) => {});
	const scheduled: Array<{ callback: () => void; delayMs: number }> = [];

	const deps: QuitCleanupDeps = {
		isDev: false,
		forceFullCleanup: false,
		isUpdateInstalling: false,
		stopHostServices,
		teardownTerminalHost,
		stopPtyDaemons,
		disposeTerminalHostClient,
		disposeTray: () => {},
		forceExit,
		scheduleTimer: (callback, delayMs) => {
			scheduled.push({ callback, delayMs });
		},
		logError: () => {},
		...overrides,
	};

	return {
		deps,
		forceExit,
		teardownTerminalHost,
		disposeTerminalHostClient,
		stopHostServices,
		stopPtyDaemons,
		scheduled,
	};
}

describe("runQuitCleanup", () => {
	test("force-exits immediately on a normal quit", async () => {
		const h = createHarness();

		await runQuitCleanup(h.deps);

		expect(h.forceExit).toHaveBeenCalledWith(0);
		expect(h.scheduled).toHaveLength(0);
	});

	// Regression: #6048 — pressing "Update" closed the app without installing the
	// update and without relaunching. `quitAndInstall()` only starts the
	// Squirrel.Mac handoff; ShipIt is launched asynchronously and swaps the bundle
	// after the app terminates. Calling `app.exit(0)` from `before-quit` kills the
	// browser process out from under that handoff (and skips `will-quit`
	// entirely), so the user gets a closed app that is still on the old version.
	test("does not force-exit while an update install is in flight", async () => {
		const h = createHarness({ isUpdateInstalling: true });

		await runQuitCleanup(h.deps);

		expect(h.forceExit).not.toHaveBeenCalled();
	});

	test("arms a watchdog exit if Squirrel never terminates the app", async () => {
		const h = createHarness({ isUpdateInstalling: true });

		await runQuitCleanup(h.deps);

		expect(h.scheduled).toHaveLength(1);
		expect(h.scheduled[0].delayMs).toBe(UPDATE_INSTALL_EXIT_GRACE_MS);

		h.scheduled[0].callback();
		expect(h.forceExit).toHaveBeenCalledWith(0);
	});

	test("still runs cleanup before handing off to the updater", async () => {
		const h = createHarness({ isUpdateInstalling: true });

		await runQuitCleanup(h.deps);

		expect(h.stopHostServices).toHaveBeenCalled();
		// terminal-host owns the PTY subprocesses: detach, never tear down, so
		// sessions can be reattached after the update relaunch.
		expect(h.disposeTerminalHostClient).toHaveBeenCalled();
		expect(h.teardownTerminalHost).not.toHaveBeenCalled();
	});

	test("keeps the pty-daemons alive on a normal quit", async () => {
		const h = createHarness();

		await runQuitCleanup(h.deps);

		expect(h.stopPtyDaemons).not.toHaveBeenCalled();
		expect(h.teardownTerminalHost).not.toHaveBeenCalled();
	});

	test("stops every terminal process for a quit-completely", async () => {
		const h = createHarness({ forceFullCleanup: true });

		await runQuitCleanup(h.deps);

		expect(h.teardownTerminalHost).toHaveBeenCalled();
		expect(h.stopPtyDaemons).toHaveBeenCalledWith([101, 102]);
		expect(h.forceExit).toHaveBeenCalledWith(0);
	});

	test("exits a quit-completely whose cleanup hangs once the deadline passes", async () => {
		const h = createHarness({
			forceFullCleanup: true,
			teardownTerminalHost: () => new Promise<void>(() => {}),
		});

		const done = runQuitCleanup(h.deps);
		await Promise.resolve();
		expect(h.forceExit).not.toHaveBeenCalled();
		expect(h.scheduled[0].delayMs).toBe(FULL_CLEANUP_TIMEOUT_MS);

		h.scheduled[0].callback();
		await done;
		expect(h.forceExit).toHaveBeenCalledWith(0);
	});

	test("force-exits even if cleanup throws", async () => {
		const h = createHarness({
			stopHostServices: () => {
				throw new Error("boom");
			},
		});

		await runQuitCleanup(h.deps);

		expect(h.forceExit).toHaveBeenCalledWith(0);
	});
});
