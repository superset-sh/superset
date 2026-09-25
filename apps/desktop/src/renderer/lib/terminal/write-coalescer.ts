/**
 * Coalesces PTY output chunks into one xterm.write() per animation frame.
 *
 * Agent CLIs (Claude Code especially) emit full-screen repaints as many small
 * PTY chunks. Writing each chunk individually triggers an xterm parse/render
 * cycle per chunk, which overwhelms the renderer during streaming output.
 * Batching to the display refresh rate makes the cost per frame constant
 * regardless of chunk count. See issues #2241 / #2244.
 *
 * Frame batching alone still lets a sustained burst outrun the emulator: it
 * keeps its own queue of unparsed data and throws the batch away once that
 * queue passes its ceiling. So a batch is only handed over while the emulator
 * reports itself drained — its write-completion callback is the signal.
 *
 * That moves a burst's backlog out of the emulator and into `pending`, so the
 * ceiling has to move here with it: MAX_BACKLOG_BYTES bounds the queue, and
 * the pane is told when it is hit.
 */

/**
 * Pending-byte ceiling. requestAnimationFrame stalls while the window is
 * hidden (Electron throttles backgrounded renderers), so without a cap the
 * buffer could grow unboundedly during a background firehose. Exceeding the
 * cap writes early instead of waiting for a frame that may be far off. It
 * doubles as the "we are behind" mark: past it, a drained emulator is handed
 * the next batch straight away rather than idling until the next frame.
 */
export const MAX_PENDING_BYTES = 1024 * 1024;

/**
 * Hard ceiling on the coalescer's own queue.
 *
 * Waiting for the emulator's drain signal is what keeps it from discarding
 * data, but it also means a slow parser's backlog accumulates here instead of
 * there — and unlike the emulator's queue, `pending` has no ceiling of its
 * own. A backgrounded renderer is the case that matters: Electron throttles
 * it, so the parser advances in ~12ms slices per second while PTY bytes keep
 * arriving at full rate. Left unbounded that ends in a renderer OOM, which
 * kills every pane in the window rather than corrupting one of them.
 *
 * 8 MB because host-service already treats exactly that much un-consumed
 * output on this stream as hopelessly behind (WS_SEND_BUFFER_CAP_BYTES, which
 * drops the socket), and because at 8x the flush cap an ordinary heavy burst
 * never comes near it.
 */
export const MAX_BACKLOG_BYTES = 8 * 1024 * 1024;

/**
 * Written into the stream at the point bytes went missing. Silent loss is what
 * this whole path exists to remove, so an overflow has to be visible in the
 * pane it happened to.
 */
const DROP_NOTICE = new TextEncoder().encode(
	`\r\n[terminal] dropped output — renderer fell more than ${
		MAX_BACKLOG_BYTES / (1024 * 1024)
	} MB behind\r\n`,
);

export interface WriteCoalescer {
	/** Queue PTY bytes for the next frame's write. */
	push(chunk: Uint8Array): void;
	/**
	 * Write everything pending right now. Call before writing anything else
	 * to the terminal (exit notices, error lines) so output stays ordered.
	 */
	flushSync(): void;
	/** Flush remaining bytes and stop accepting new ones. */
	dispose(): void;
}

export function createWriteCoalescer(
	/** `done` is the emulator's write-completion callback: it has parsed the batch. */
	write: (data: Uint8Array, done: () => void) => void,
): WriteCoalescer {
	let pending: Uint8Array[] = [];
	let pendingBytes = 0;
	let frameId: number | null = null;
	let inFlight = 0;
	let disposed = false;
	// One notice per overflow episode, not per flush: a firehose that drops for
	// a minute would otherwise bury the pane under its own notices. `dropping`
	// holds the episode open while `droppedSinceFlush` keeps confirming it.
	let dropping = false;
	let dropNoticeOwed = false;
	let droppedSinceFlush = false;

	/**
	 * Drop from the head, never the tail. A terminal's worth is the screen it
	 * ends up showing, and the bytes that decide that are the newest ones —
	 * agent CLIs repaint constantly, so a pane that keeps the tail resyncs on
	 * the next repaint. Dropping the tail instead would leave it permanently
	 * behind and permanently wrong.
	 */
	function dropOldest() {
		let cut = 0;
		let dropped = 0;
		while (cut < pending.length && pendingBytes - dropped > MAX_BACKLOG_BYTES) {
			dropped += (pending[cut] as Uint8Array).length;
			cut++;
		}
		pending.splice(0, cut);
		pendingBytes -= dropped;
		droppedSinceFlush = true;
		if (dropping) return;
		dropping = true;
		dropNoticeOwed = true;
	}

	function scheduleFrame() {
		if (frameId !== null) return;
		frameId = requestAnimationFrame(() => {
			frameId = null;
			// Emulator still parsing: onDrained schedules the next batch.
			if (inFlight > 0) return;
			flushSync();
		});
	}

	function onDrained() {
		inFlight--;
		if (disposed || inFlight > 0 || pendingBytes === 0) return;
		// Same rule push uses: a full cap's worth banked means we are behind,
		// so hand the next batch over now rather than idle until the frame.
		if (pendingBytes > MAX_PENDING_BYTES) flushSync();
		else scheduleFrame();
	}

	function flushSync() {
		if (frameId !== null) {
			cancelAnimationFrame(frameId);
			frameId = null;
		}
		if (pendingBytes === 0) return;
		if (dropNoticeOwed) {
			dropNoticeOwed = false;
			// Prepended at flush rather than queued at the drop, because a
			// later drop takes from the head and would eat the notice itself.
			pending.unshift(DROP_NOTICE);
			pendingBytes += DROP_NOTICE.length;
		}
		if (!droppedSinceFlush) dropping = false;
		droppedSinceFlush = false;
		let batch: Uint8Array;
		if (pending.length === 1) {
			batch = pending[0] as Uint8Array;
		} else {
			batch = new Uint8Array(pendingBytes);
			let offset = 0;
			for (const chunk of pending) {
				batch.set(chunk, offset);
				offset += chunk.length;
			}
		}
		pending = [];
		pendingBytes = 0;
		inFlight++;
		let drained = false;
		try {
			write(batch, () => {
				if (drained) return;
				drained = true;
				// Deferred, not immediate: the emulator invokes this from inside
				// its parse loop and before it drops the batch from its own
				// pending count, so writing here would both re-enter that loop
				// and be measured against a count that still includes this batch.
				queueMicrotask(onDrained);
			});
		} catch (error) {
			// The emulator throws instead of buffering once its own ceiling is
			// passed, and then never calls back. Release here or nothing is ever
			// written to this terminal again.
			if (!drained) {
				drained = true;
				inFlight--;
			}
			throw error;
		}
	}

	function push(chunk: Uint8Array) {
		if (disposed) return;
		pending.push(chunk);
		pendingBytes += chunk.length;
		// Back-pressure. While the emulator is still parsing the last batch,
		// hold everything: another write only grows the queue it discards when
		// it overflows. onDrained picks these bytes up the moment it catches up.
		if (inFlight > 0) {
			// The only path that can grow `pending` without bound: below, a
			// queue past MAX_PENDING_BYTES is always written out instead.
			if (pendingBytes > MAX_BACKLOG_BYTES) dropOldest();
			return;
		}
		if (pendingBytes > MAX_PENDING_BYTES) {
			flushSync();
			return;
		}
		scheduleFrame();
	}

	return {
		push,
		flushSync,
		dispose() {
			if (disposed) return;
			flushSync();
			disposed = true;
		},
	};
}
