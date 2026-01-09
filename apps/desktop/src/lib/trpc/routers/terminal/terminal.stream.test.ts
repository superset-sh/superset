import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

let terminalManager: EventEmitter = new EventEmitter();

mock.module("main/lib/terminal", () => ({
	DaemonTerminalManager: class DaemonTerminalManager extends EventEmitter {},
	getActiveTerminalManager: () => terminalManager,
}));

// Avoid importing Electron/local-db during test bootstrap.
mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				where: () => ({
					get: () => undefined,
				}),
			}),
		}),
	},
}));

const { createTerminalRouter } = await import("./terminal");

describe("terminal.stream", () => {
	it("does not complete on exit (paneId is stable across restarts)", async () => {
		terminalManager = new EventEmitter();

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const stream$ = await caller.stream("pane-1");

		const events: Array<{ type: string }> = [];
		let didComplete = false;

		const subscription = stream$.subscribe({
			next: (event) => {
				events.push(event);
			},
			complete: () => {
				didComplete = true;
			},
		});

		terminalManager.emit("exit:pane-1", 0, 15);

		expect(didComplete).toBe(false);
		expect(terminalManager.listenerCount("data:pane-1")).toBeGreaterThan(0);

		terminalManager.emit("data:pane-1", "echo ok\r\n");

		expect(events.map((e) => e.type)).toEqual(["exit", "data"]);

		subscription.unsubscribe();

		expect(terminalManager.listenerCount("data:pane-1")).toBe(0);
		expect(terminalManager.listenerCount("exit:pane-1")).toBe(0);
		expect(terminalManager.listenerCount("disconnect:pane-1")).toBe(0);
		expect(terminalManager.listenerCount("error:pane-1")).toBe(0);
	});
});
