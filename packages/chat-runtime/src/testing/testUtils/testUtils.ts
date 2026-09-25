import type { DurableEnvelope, Envelope } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import { FakeHarness } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { readSince } from "../../replay";
import type { HarnessRegistry } from "../../sessions";
import type { Schedule, Sink } from "../../stream";

export const FAKE_HARNESS = "fake";

export function fakeHarnessRegistry(script: FakeHarnessScript): {
	harnesses: HarnessRegistry;
	adapters: FakeHarness[];
} {
	const adapters: FakeHarness[] = [];
	const harnesses: HarnessRegistry = new Map([
		[
			FAKE_HARNESS,
			() => {
				const adapter = new FakeHarness(script);
				adapters.push(adapter);
				return adapter;
			},
		],
	]);
	return { harnesses, adapters };
}

export function createManualSchedule(): {
	schedule: Schedule;
	flush: () => void;
	pendingCount: () => number;
} {
	let pending: (() => void)[] = [];
	const schedule: Schedule = (callback) => {
		pending.push(callback);
		return () => {
			pending = pending.filter((entry) => entry !== callback);
		};
	};
	return {
		schedule,
		flush: () => {
			const batch = pending;
			pending = [];
			for (const callback of batch) callback();
		},
		pendingCount: () => pending.length,
	};
}

export function createRecordingSink(): {
	sink: Sink;
	envelopes: Envelope[];
	closed: () => boolean;
} {
	const envelopes: Envelope[] = [];
	let isClosed = false;
	return {
		envelopes,
		closed: () => isClosed,
		sink: {
			send: (envelope) => {
				envelopes.push(envelope);
			},
			close: () => {
				isClosed = true;
			},
		},
	};
}

export function journalEnvelopes(
	runtime: ChatRuntime,
	sessionId: string,
): DurableEnvelope[] {
	const session = runtime.sessions.get(sessionId);
	if (!session) return [];
	const replay = readSince(runtime.db, sessionId, {
		epoch: session.epoch,
		seq: 0,
	});
	return replay.ok ? replay.envelopes : [];
}

export async function waitFor(
	predicate: () => boolean,
	timeoutMs = 2000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error("waitFor timed out");
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}
