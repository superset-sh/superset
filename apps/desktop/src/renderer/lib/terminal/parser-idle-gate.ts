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
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			gate.pending--;
			if (gate.pending === 0 && gate.queued) {
				queueMicrotask(() => flushQueued(gate));
			}
		};
		try {
			write(data, () => {
				try {
					callback?.();
				} finally {
					release();
				}
			});
		} catch (error) {
			// xterm throws out of write() when its own pending-data ceiling is
			// passed, and then never calls back. Release here or pending never
			// returns to zero and queued work waits forever.
			release();
			throw error;
		}
	};
}

export function runWhenParserIdle(gate: ParserIdleGate, fn: () => void): void {
	if (gate.pending === 0) {
		fn();
		return;
	}
	gate.queued = fn;
}
