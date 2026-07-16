import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createParserIdleGate, wrapWrite } from "./parser-idle-gate";
import type { TerminalRuntime } from "./terminal-runtime";
import {
	drainRuntimeForRelease,
	TerminalRuntimeRegistryImpl,
} from "./terminal-runtime-registry";
import { createTransport } from "./terminal-ws-transport";
import { createWriteCoalescer } from "./write-coalescer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;

interface TestRegistryEntry {
	runtime: TerminalRuntime | null;
}

function seedRegistryRuntime(
	registry: TerminalRuntimeRegistryImpl,
	terminalId: string,
	runtime: TerminalRuntime,
) {
	const internals = registry as unknown as {
		getOrCreateEntry: (
			terminalId: string,
			instanceId?: string,
		) => TestRegistryEntry;
	};
	const entry = internals.getOrCreateEntry(terminalId);
	entry.runtime = runtime;
	return {
		entry,
		reacquire: () => internals.getOrCreateEntry(terminalId),
	};
}

function makeReleaseRuntime(
	flush: () => boolean,
	onTerminalDispose: () => void = () => {},
): TerminalRuntime {
	return {
		terminalId: "registry-release-test",
		gate: createParserIdleGate(),
		_persistence: {
			flush,
			getReplayCheckpoint: () => new Uint8Array(),
			dispose: () => {},
		},
		terminal: { cols: 80, rows: 24, dispose: onTerminalDispose },
		serializeAddon: { serialize: () => "snapshot" },
		wrapper: { remove: () => {} },
		container: null,
		resizeObserver: null,
	} as unknown as TerminalRuntime;
}

beforeEach(() => {
	globalThis.requestAnimationFrame = () => 1;
	globalThis.cancelAnimationFrame = () => {};
});

afterEach(() => {
	globalThis.requestAnimationFrame = originalRaf;
	globalThis.cancelAnimationFrame = originalCancelRaf;
});

describe("terminal runtime background release", () => {
	test("waits for the final coalesced parser callback before persisting a durable snapshot", async () => {
		const events: string[] = [];
		const delayedParserCallbacks: Array<() => void> = [];
		let parsedBuffer = "prompt> ";
		const gate = createParserIdleGate();
		const write = wrapWrite(gate, (data, callback) => {
			delayedParserCallbacks.push(() => {
				parsedBuffer += typeof data === "string" ? data : decoder.decode(data);
				events.push("parser-idle");
				callback?.();
			});
		});
		const transport = createTransport();
		transport._updateReplayCheckpoint = () => {
			events.push("checkpoint-updated");
		};
		transport._writeCoalescer = createWriteCoalescer((data) => {
			write(data, () => transport._updateReplayCheckpoint?.(data));
		});
		transport._writeCoalescer.push(encoder.encode("last-live-batch"));

		const runtime = {
			gate,
			_persistence: {
				flush: () => {
					events.push(`snapshot:${parsedBuffer}`);
					return true;
				},
			},
		} as unknown as Pick<TerminalRuntime, "gate" | "_persistence">;

		const release = drainRuntimeForRelease(transport, runtime, async () => {
			events.push("chromium-storage-flushed");
			return true;
		});

		await Promise.resolve();
		expect(events).toEqual([]);
		expect(delayedParserCallbacks).toHaveLength(1);
		expect(transport._updateReplayCheckpoint).not.toBeNull();

		delayedParserCallbacks.shift()?.();
		expect(await release).toBe("durable");

		expect(events).toEqual([
			"parser-idle",
			"checkpoint-updated",
			"snapshot:prompt> last-live-batch",
			"chromium-storage-flushed",
		]);
		expect(transport._updateReplayCheckpoint).toBeNull();
	});

	test("a rapid remount cancels the old release before it can persist or dispose", async () => {
		let markStorageStarted: (() => void) | undefined;
		const storageStarted = new Promise<void>((resolve) => {
			markStorageStarted = resolve;
		});
		let finishStorage: ((durable: boolean) => void) | undefined;
		const storageFinished = new Promise<boolean>((resolve) => {
			finishStorage = resolve;
		});
		let localFlushes = 0;
		let runtimeDisposals = 0;
		const runtime = makeReleaseRuntime(
			() => {
				localFlushes += 1;
				return true;
			},
			() => {
				runtimeDisposals += 1;
			},
		);
		const registry = new TerminalRuntimeRegistryImpl(async () => {
			markStorageStarted?.();
			return storageFinished;
		});
		const { entry, reacquire } = seedRegistryRuntime(
			registry,
			"rapid-remount",
			runtime,
		);

		const release = registry.release("rapid-remount");
		await storageStarted;
		const remounted = reacquire();
		finishStorage?.(true);
		await release;

		expect(remounted).toBe(entry);
		expect(remounted.runtime).toBe(runtime);
		expect(localFlushes).toBe(1);
		expect(runtimeDisposals).toBe(0);
	});

	test("a remount cancels parser drain without waiting for new-owner writes", async () => {
		const parserCallbacks: Array<() => void> = [];
		let persistenceFlushes = 0;
		let runtimeDisposals = 0;
		const runtime = makeReleaseRuntime(
			() => {
				persistenceFlushes += 1;
				return true;
			},
			() => {
				runtimeDisposals += 1;
			},
		);
		const write = wrapWrite(runtime.gate, (_data, callback) => {
			parserCallbacks.push(() => callback?.());
		});
		write("old-owner");
		const registry = new TerminalRuntimeRegistryImpl(async () => true);
		const seeded = seedRegistryRuntime(
			registry,
			"parser-drain-remount",
			runtime,
		);

		const release = registry.release("parser-drain-remount");
		expect(seeded.reacquire()).toBe(seeded.entry);
		write("new-owner");
		const outcome = await Promise.race([
			release.then(() => "released" as const),
			new Promise<"timeout">((resolve) =>
				setTimeout(() => resolve("timeout"), 100),
			),
		]);

		expect(outcome).toBe("released");
		expect(runtime.gate.pending).toBe(2);
		expect(persistenceFlushes).toBe(0);
		expect(runtimeDisposals).toBe(0);
		for (const callback of parserCallbacks) callback();
		await Promise.resolve();
		expect(runtime.gate.pending).toBe(0);
	});

	test("retains the runtime when local or Chromium durability fails", async () => {
		let chromiumFlushes = 0;
		const localFailureRegistry = new TerminalRuntimeRegistryImpl(async () => {
			chromiumFlushes += 1;
			return true;
		});
		const localFailure = seedRegistryRuntime(
			localFailureRegistry,
			"local-failure",
			makeReleaseRuntime(() => false),
		);
		await localFailureRegistry.release("local-failure");
		expect(localFailure.reacquire()).toBe(localFailure.entry);
		expect(localFailure.entry.runtime).not.toBeNull();
		expect(chromiumFlushes).toBe(0);

		const chromiumFailureRegistry = new TerminalRuntimeRegistryImpl(
			async () => {
				chromiumFlushes += 1;
				return false;
			},
		);
		const chromiumFailure = seedRegistryRuntime(
			chromiumFailureRegistry,
			"chromium-failure",
			makeReleaseRuntime(() => true),
		);
		await chromiumFailureRegistry.release("chromium-failure");
		expect(chromiumFailure.reacquire()).toBe(chromiumFailure.entry);
		expect(chromiumFailure.entry.runtime).not.toBeNull();
		expect(chromiumFlushes).toBe(1);
	});

	test("deletes and disposes the entry only after release is durable", async () => {
		let runtimeDisposals = 0;
		const registry = new TerminalRuntimeRegistryImpl(async () => true);
		const seeded = seedRegistryRuntime(
			registry,
			"durable-release",
			makeReleaseRuntime(
				() => true,
				() => {
					runtimeDisposals += 1;
				},
			),
		);

		await registry.release("durable-release");

		expect(seeded.reacquire()).not.toBe(seeded.entry);
		expect(runtimeDisposals).toBe(1);
	});

	test("release is a no-throw boundary when cleanup raises", async () => {
		const originalError = console.error;
		const errors: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		try {
			const registry = new TerminalRuntimeRegistryImpl(async () => true);
			const seeded = seedRegistryRuntime(
				registry,
				"throwing-release",
				makeReleaseRuntime(() => {
					throw new Error("synthetic persistence failure");
				}),
			);
			await registry.release("throwing-release");
			expect(seeded.reacquire()).toBe(seeded.entry);
			expect(seeded.entry.runtime).not.toBeNull();
			expect(errors).toHaveLength(1);
		} finally {
			console.error = originalError;
		}
	});
});
