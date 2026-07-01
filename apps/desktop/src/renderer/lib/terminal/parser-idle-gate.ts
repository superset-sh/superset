// xterm resize re-enters the parser. If an async parser handler is paused
// mid-write (inline image decode), wait for the write callback before resizing.

type WriteFn = (data: string | Uint8Array, callback?: () => void) => void;

export interface ParserIdleGate {
	pending: number;
	queued: (() => void) | null;
}

export function createParserIdleGate(): ParserIdleGate {
	return { pending: 0, queued: null };
}

export function cancelParserIdleWork(gate: ParserIdleGate): void {
	gate.queued = null;
}

function flushQueued(gate: ParserIdleGate): void {
	if (gate.pending !== 0) return;
	const fn = gate.queued;
	if (!fn) return;
	gate.queued = null;
	fn();
}

export function wrapWrite(gate: ParserIdleGate, write: WriteFn): WriteFn {
	return (data, callback) => {
		gate.pending++;
		write(data, () => {
			try {
				callback?.();
			} finally {
				gate.pending--;
				if (gate.pending === 0 && gate.queued) {
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
