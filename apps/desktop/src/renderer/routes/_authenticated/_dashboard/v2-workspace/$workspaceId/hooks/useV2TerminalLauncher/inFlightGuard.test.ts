import { describe, expect, test } from "bun:test";
import { createInFlightGuard } from "./inFlightGuard";

function deferred<T = void>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("createInFlightGuard", () => {
	test("reproduces #4384: without a guard, rapid Cmd+T presses all spawn a terminal once the daemon bootstrap unblocks", async () => {
		// Simulates the cold-start daemon bootstrap that blocks
		// `terminal.createSession`. Every call sees the same pending promise
		// and unblocks together when it resolves.
		const bootstrap = deferred<void>();
		let terminalsCreated = 0;
		const createTerminal = async () => {
			await bootstrap.promise;
			terminalsCreated += 1;
		};

		// User mashes Cmd+T five times during the bootstrap window.
		const presses = Array.from({ length: 5 }, () => createTerminal());

		bootstrap.resolve();
		await Promise.all(presses);

		// Without an in-flight guard, every queued press creates a terminal.
		expect(terminalsCreated).toBe(5);
	});

	test("with the guard, rapid presses while a creation is in flight are dropped", async () => {
		const bootstrap = deferred<void>();
		let terminalsCreated = 0;
		const guard = createInFlightGuard();

		const press = () =>
			guard.run(async () => {
				await bootstrap.promise;
				terminalsCreated += 1;
			});

		const presses = Array.from({ length: 5 }, () => press());

		bootstrap.resolve();
		await Promise.all(presses);

		expect(terminalsCreated).toBe(1);
	});

	test("releases the lock so subsequent presses succeed once the prior call settles", async () => {
		const guard = createInFlightGuard();
		let terminalsCreated = 0;
		const press = () =>
			guard.run(async () => {
				terminalsCreated += 1;
			});

		await press();
		await press();
		await press();

		expect(terminalsCreated).toBe(3);
	});

	test("releases the lock when the wrapped function rejects", async () => {
		const guard = createInFlightGuard();
		let attempts = 0;

		await expect(
			guard.run(async () => {
				attempts += 1;
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		await guard.run(async () => {
			attempts += 1;
		});

		expect(attempts).toBe(2);
	});
});
