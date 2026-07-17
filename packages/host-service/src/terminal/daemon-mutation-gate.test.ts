import { describe, expect, test } from "bun:test";
import {
	__createDaemonMutationGateForTesting,
	beginDaemonUpdate,
	DaemonMutationQueueOverflowError,
	registerDaemonMutationTransportHooks,
	runDaemonMutation,
} from "./daemon-mutation-gate.ts";

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const generousLimits = { maxOperations: 32, maxBytes: 1024 };

describe("daemon mutation gate", () => {
	test("beginUpdate closes synchronously and waits for an active mutation plus same-socket barrier", async () => {
		const events: string[] = [];
		const active = deferred();
		const unregister = registerDaemonMutationTransportHooks({
			barrier: async () => {
				events.push("barrier");
			},
			invalidateAfterSuccess: async () => {
				events.push("invalidate");
			},
			resumeAfterAbort: async () => {
				events.push("abort");
			},
			resetAfterForceRestart: async () => {},
		});
		try {
			const gate = __createDaemonMutationGateForTesting(
				"org-active",
				generousLimits,
			);
			const first = gate.run({ kind: "open" }, async () => {
				events.push("active-start");
				await active.promise;
				events.push("active-end");
			});
			await Promise.resolve();

			const lease = gate.beginUpdate();
			const held = gate.run({ kind: "input", byteCost: 1 }, async () => {
				events.push("held");
			});
			await Promise.resolve();
			expect(events).toEqual(["active-start"]);

			active.resolve();
			await lease.waitUntilDrained();
			expect(events).toEqual(["active-start", "active-end", "barrier"]);
			await lease.release("abort");
			await Promise.all([first, held]);
			expect(events).toEqual([
				"active-start",
				"active-end",
				"barrier",
				"abort",
				"held",
			]);
		} finally {
			unregister();
		}
	});

	test("success flushes copied open and input once, in FIFO order, through the successor", async () => {
		type FakeClient = { name: string; calls: string[] };
		const predecessor: FakeClient = { name: "predecessor", calls: [] };
		const successor: FakeClient = { name: "successor", calls: [] };
		let current = predecessor;
		const unregister = registerDaemonMutationTransportHooks({
			barrier: async () => {
				predecessor.calls.push("barrier");
			},
			invalidateAfterSuccess: async () => {
				current = successor;
			},
			resumeAfterAbort: async () => {},
			resetAfterForceRestart: async () => {},
		});
		try {
			const gate = __createDaemonMutationGateForTesting(
				"org-success",
				generousLimits,
			);
			const lease = gate.beginUpdate();
			const openId = `${"terminal-1"}`;
			const mutableInput = Buffer.from("abc");
			const copiedInput = Buffer.from(mutableInput);
			const open = gate.run(
				{ kind: "open", byteCost: openId.length },
				async () => {
					current.calls.push(`open:${openId}`);
				},
			);
			const input = gate.run(
				{ kind: "input", byteCost: copiedInput.byteLength },
				async () => {
					current.calls.push(`input:${copiedInput.toString("utf8")}`);
				},
			);
			mutableInput.fill(0x7a);

			await lease.waitUntilDrained();
			await lease.release("success");
			await Promise.all([open, input]);
			expect(predecessor.calls).toEqual(["barrier"]);
			expect(successor.calls).toEqual(["open:terminal-1", "input:abc"]);
		} finally {
			unregister();
		}
	});

	test("abort preserves the predecessor and flushes every held mutation once", async () => {
		const calls: string[] = [];
		const unregister = registerDaemonMutationTransportHooks({
			barrier: async () => {
				calls.push("barrier");
			},
			invalidateAfterSuccess: async () => {
				calls.push("unexpected-invalidate");
			},
			resumeAfterAbort: async () => {
				calls.push("resume-predecessor");
			},
			resetAfterForceRestart: async () => {},
		});
		try {
			const gate = __createDaemonMutationGateForTesting(
				"org-abort",
				generousLimits,
			);
			const lease = gate.beginUpdate();
			const input = gate.run({ kind: "input", byteCost: 1 }, async () => {
				calls.push("predecessor-input");
			});
			await lease.waitUntilDrained();
			await lease.release("abort");
			await input;
			expect(calls).toEqual([
				"barrier",
				"resume-predecessor",
				"predecessor-input",
			]);
		} finally {
			unregister();
		}
	});

	test("count- and byte-bounded queues reject visibly without dropping accepted entries", async () => {
		const countGate = __createDaemonMutationGateForTesting("org-count-cap", {
			maxOperations: 1,
			maxBytes: 100,
		});
		const countLease = countGate.beginUpdate();
		const countAccepted = countGate.run(
			{ kind: "input", byteCost: 3 },
			async () => "count-ok",
		);
		const countRejected = countGate.run(
			{ kind: "input", byteCost: 1 },
			async () => Promise.resolve("never"),
		);
		await expect(countRejected).rejects.toBeInstanceOf(
			DaemonMutationQueueOverflowError,
		);
		await countLease.waitUntilDrained();
		await countLease.release("abort");
		expect(await countAccepted).toBe("count-ok");

		const byteGate = __createDaemonMutationGateForTesting("org-byte-cap", {
			maxOperations: 10,
			maxBytes: 3,
		});
		const byteLease = byteGate.beginUpdate();
		const byteAccepted = byteGate.run(
			{ kind: "input", byteCost: 2 },
			async () => "byte-ok",
		);
		const byteRejected = byteGate.run(
			{ kind: "input", byteCost: 2 },
			async () => Promise.resolve("never"),
		);
		await expect(byteRejected).rejects.toBeInstanceOf(
			DaemonMutationQueueOverflowError,
		);
		await byteLease.waitUntilDrained();
		await byteLease.release("abort");
		expect(await byteAccepted).toBe("byte-ok");
	});

	test("release continues after one failure and includes operations appended during release", async () => {
		const calls: string[] = [];
		const firstStarted = deferred();
		const allowFirst = deferred();
		const gate = __createDaemonMutationGateForTesting(
			"org-tail",
			generousLimits,
		);
		const lease = gate.beginUpdate();
		const first = gate.run({ kind: "input" }, async () => {
			calls.push("first");
			firstStarted.resolve();
			await allowFirst.promise;
			throw new Error("expected failure");
		});
		const second = gate.run({ kind: "resize" }, async () => {
			calls.push("second");
		});
		await lease.waitUntilDrained();
		const releasing = lease.release("abort");
		await firstStarted.promise;
		const tail = gate.run({ kind: "close" }, async () => {
			calls.push("tail");
		});
		allowFirst.resolve();
		await releasing;
		await expect(first).rejects.toThrow("expected failure");
		await Promise.all([second, tail]);
		expect(calls).toEqual(["first", "second", "tail"]);
	});

	test("organizations are isolated and repeated drain waits run the barrier only once", async () => {
		const orgA = `org-isolated-a-${crypto.randomUUID()}`;
		const orgB = `org-isolated-b-${crypto.randomUUID()}`;
		const barriers: string[] = [];
		const unregister = registerDaemonMutationTransportHooks({
			barrier: async (organizationId) => {
				barriers.push(organizationId);
			},
			invalidateAfterSuccess: async () => {},
			resumeAfterAbort: async () => {},
			resetAfterForceRestart: async () => {},
		});
		try {
			const leaseA = beginDaemonUpdate(orgA);
			let aRan = false;
			let bRan = false;
			const heldA = runDaemonMutation(orgA, { kind: "input" }, async () => {
				aRan = true;
			});
			await runDaemonMutation(orgB, { kind: "input" }, async () => {
				bRan = true;
			});
			expect(aRan).toBe(false);
			expect(bRan).toBe(true);

			await Promise.all([leaseA.waitUntilDrained(), leaseA.waitUntilDrained()]);
			expect(barriers).toEqual([orgA]);
			await leaseA.release("abort");
			await heldA;
			expect(aRan).toBe(true);
		} finally {
			unregister();
		}
	});

	test("force-restart recovery rejects held work visibly and reopens the gate", async () => {
		const calls: string[] = [];
		const unregister = registerDaemonMutationTransportHooks({
			barrier: async () => {},
			invalidateAfterSuccess: async () => {
				calls.push("rotate");
			},
			resumeAfterAbort: async () => {},
			resetAfterForceRestart: async () => {
				calls.push("rotate");
			},
		});
		try {
			const gate = __createDaemonMutationGateForTesting(
				"org-force-restart",
				generousLimits,
			);
			const lease = gate.beginUpdate();
			const held = gate.run({ kind: "input", byteCost: 3 }, async () => {
				calls.push("must-not-run");
			});
			await lease.resetAfterForceRestart(new Error("sessions replaced"));
			await expect(held).rejects.toThrow("sessions replaced");
			await gate.run({ kind: "open" }, async () => {
				calls.push("fresh-open");
			});
			expect(calls).toEqual(["rotate", "fresh-open"]);
		} finally {
			unregister();
		}
	});

	test("transport hook failure stays fail-closed and does not execute held work", async () => {
		let executed = false;
		const unregister = registerDaemonMutationTransportHooks({
			barrier: async () => {},
			invalidateAfterSuccess: async () => {
				throw new Error("rotation failed");
			},
			resumeAfterAbort: async () => {},
			resetAfterForceRestart: async () => {},
		});
		try {
			const gate = __createDaemonMutationGateForTesting(
				"org-hook-failure",
				generousLimits,
			);
			const lease = gate.beginUpdate();
			const held = gate.run({ kind: "input" }, async () => {
				executed = true;
			});
			await lease.waitUntilDrained();
			await expect(lease.release("success")).rejects.toThrow("rotation failed");
			expect(executed).toBe(false);
			await lease.resetAfterForceRestart(new Error("sessions replaced"));
			await expect(held).rejects.toThrow("sessions replaced");
			await gate.run({ kind: "open" }, async () => {});
		} finally {
			unregister();
		}
	});

	test("an existing-session open can queue its initial input during hold without deadlock or duplication", async () => {
		const outerPaused = deferred();
		const continueOuter = deferred();
		const calls: string[] = [];
		const gate = __createDaemonMutationGateForTesting(
			"org-existing-initial",
			generousLimits,
		);
		let initialInput: Promise<void> | null = null;
		const existingSession = gate.run({ kind: "open" }, async () => {
			calls.push("existing-session");
			outerPaused.resolve();
			await continueOuter.promise;
			// Mirrors queueInitialCommand(): fire-and-track rather than await a
			// nested gate operation while the outer open lease is still active.
			initialInput = gate.run({ kind: "input", byteCost: 4 }, async () => {
				calls.push("initial-input");
			});
		});
		await outerPaused.promise;
		const lease = gate.beginUpdate();
		continueOuter.resolve();
		await lease.waitUntilDrained();
		await lease.release("abort");
		await existingSession;
		await initialInput;
		expect(calls).toEqual(["existing-session", "initial-input"]);
	});
});
