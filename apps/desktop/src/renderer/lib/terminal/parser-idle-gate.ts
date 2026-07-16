// xterm resize re-enters the parser. If an async parser handler is paused
// mid-write (inline image decode), wait for the write callback before resizing.

type WriteFn = (data: string | Uint8Array, callback?: () => void) => void;

export interface ParserIdleGate {
	pending: number;
	queued: (() => void) | null;
	idleWaiters: Set<() => void>;
}

export function createParserIdleGate(): ParserIdleGate {
	return { pending: 0, queued: null, idleWaiters: new Set() };
}

export function cancelParserIdleWork(gate: ParserIdleGate): void {
	gate.queued = null;
}

function flushQueued(gate: ParserIdleGate): void {
	if (gate.pending !== 0) return;
	const fn = gate.queued;
	if (fn) {
		gate.queued = null;
		fn();
		if (gate.pending !== 0) return;
	}
	const waiters = [...gate.idleWaiters];
	gate.idleWaiters.clear();
	for (const resolve of waiters) resolve();
}

export function wrapWrite(gate: ParserIdleGate, write: WriteFn): WriteFn {
	return (data, callback) => {
		gate.pending++;
		write(data, () => {
			try {
				callback?.();
			} finally {
				gate.pending--;
				if (gate.pending === 0 && (gate.queued || gate.idleWaiters.size > 0)) {
					queueMicrotask(() => flushQueued(gate));
				}
			}
		});
	};
}

export function runWhenParserIdle(gate: ParserIdleGate, fn: () => void): void {
	if (gate.pending === 0) {
		fn();
		return;
	}
	gate.queued = fn;
}

/** Resolve true at parser-idle, or false when ownership is cancelled first. */
export function waitForParserIdle(
	gate: ParserIdleGate,
	signal?: AbortSignal,
): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false);
	if (gate.pending === 0) return Promise.resolve(true);
	return new Promise((resolve) => {
		let settled = false;
		const settle = (idle: boolean) => {
			if (settled) return;
			settled = true;
			gate.idleWaiters.delete(onIdle);
			signal?.removeEventListener("abort", onAbort);
			resolve(idle);
		};
		const onIdle = () => settle(true);
		const onAbort = () => settle(false);
		gate.idleWaiters.add(onIdle);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
