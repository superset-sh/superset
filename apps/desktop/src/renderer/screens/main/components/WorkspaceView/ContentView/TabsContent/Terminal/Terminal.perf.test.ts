/**
 * Reproduction tests for issue #2244:
 * "[perf] Terminal rendering pipeline optimization opportunities"
 *
 * Two specific bugs are reproduced here:
 *
 * --- Bug #2240: Missing React.memo on Terminal component ---
 * The Terminal component is not wrapped in React.memo(), so any parent state
 * change (tab switching, sidebar update, workspace list change) triggers a full
 * re-render even when Terminal's own props are unchanged. This is expensive
 * because Terminal has 10+ hooks and active subscriptions.
 *
 * Fix: export const Terminal = memo(function Terminal(props) { ... })
 *
 * --- Bug #2241: No client-side write coalescing before xterm.write() ---
 * The backend already batches PTY output at ~30Hz (128KB cap). On the renderer
 * side, handleStreamData calls xterm.write() for every IPC message that arrives.
 * When agents produce rapid output, this means N IPC messages = N separate
 * xterm.write() calls per frame, each triggering parser + WebGL overhead.
 *
 * Fix: buffer pending writes and flush once per requestAnimationFrame, so all
 * messages arriving in the same frame become a single xterm.write() call.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Bug #2240 — Terminal component not wrapped in React.memo
// ---------------------------------------------------------------------------

/**
 * Models the memoization contract: a memoized component factory should skip
 * rendering when called with the same props reference. Without React.memo,
 * every parent render causes the child to re-render even with identical props.
 *
 * This models the core invariant that React.memo provides — the Terminal
 * component needs this to prevent unnecessary re-renders caused by parent
 * state changes (tab switching, sidebar updates, workspace list changes).
 */

type Props = { paneId: string; tabId: string; workspaceId: string };

function makeMemoModel(componentFn: (props: Props) => void): {
	render: (props: Props) => void;
	renderCount: number;
} {
	let lastProps: Props | undefined;
	let renderCount = 0;

	const render = (props: Props) => {
		// React.memo skips rendering if props are shallowly equal
		if (
			lastProps &&
			lastProps.paneId === props.paneId &&
			lastProps.tabId === props.tabId &&
			lastProps.workspaceId === props.workspaceId
		) {
			return; // skip — props unchanged
		}
		lastProps = props;
		renderCount++;
		componentFn(props);
	};

	return {
		render,
		get renderCount() {
			return renderCount;
		},
	};
}

function makeNonMemoModel(componentFn: (props: Props) => void): {
	render: (props: Props) => void;
	renderCount: number;
} {
	let renderCount = 0;

	const render = (props: Props) => {
		renderCount++; // always re-renders (no memoization)
		componentFn(props);
	};

	return {
		render,
		get renderCount() {
			return renderCount;
		},
	};
}

describe("Terminal component memoization — issue #2240", () => {
	const sameProps: Props = {
		paneId: "pane-1",
		tabId: "tab-1",
		workspaceId: "ws-1",
	};

	it("bug: without React.memo, component re-renders every time parent renders (even with same props)", () => {
		const model = makeNonMemoModel(() => {});

		// Parent renders 5 times with the same Terminal props (e.g. sidebar toggles)
		for (let i = 0; i < 5; i++) {
			model.render(sameProps);
		}

		// Bug: 5 renders even though props never changed
		expect(model.renderCount).toBe(5);
	});

	it("fix: with React.memo, component skips re-renders when props are unchanged", () => {
		const model = makeMemoModel(() => {});

		// Parent renders 5 times with the same Terminal props
		for (let i = 0; i < 5; i++) {
			model.render(sameProps);
		}

		// With memo: only 1 render (the first one); subsequent calls are skipped
		expect(model.renderCount).toBe(1);
	});

	it("fix: with React.memo, component re-renders when props actually change", () => {
		const model = makeMemoModel(() => {});

		model.render({ paneId: "pane-1", tabId: "tab-1", workspaceId: "ws-1" });
		model.render({ paneId: "pane-2", tabId: "tab-1", workspaceId: "ws-1" }); // paneId changed
		model.render({ paneId: "pane-2", tabId: "tab-1", workspaceId: "ws-1" }); // same again

		// 2 renders: one for initial props, one when paneId changed
		expect(model.renderCount).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Bug #2241 — xterm.write() called once per IPC message, no per-frame batching
// ---------------------------------------------------------------------------

/**
 * Models the write path in useTerminalStream.ts.
 *
 * Current behaviour: each call to handleStreamData() calls xterm.write()
 * immediately, so N messages in the same frame = N write calls.
 *
 * Expected behaviour after fix: all data arriving in the same
 * requestAnimationFrame window is coalesced into a single xterm.write() call.
 */

type WriteCoalescingModel = {
	/** Simulate receiving terminal data (current direct-write approach) */
	writeDirectly: (data: string) => void;
	/** Simulate receiving terminal data (coalesced approach) */
	scheduleWrite: (data: string) => void;
	/** Flush all pending requestAnimationFrame callbacks */
	flushRaf: () => void;
	directWriteCalls: string[];
	coalescedWriteCalls: string[];
};

function makeWriteModel(): WriteCoalescingModel {
	const directWriteCalls: string[] = [];
	const coalescedWriteCalls: string[] = [];

	// --- Direct write (current buggy behaviour) ---
	const writeDirectly = (data: string) => {
		directWriteCalls.push(data); // xterm.write(data) — one call per message
	};

	// --- Coalesced write (proposed fix) ---
	const pendingWrites: string[] = [];
	let rafScheduled = false;
	const pendingRafs: Array<() => void> = [];

	const mockRaf = (cb: () => void): void => {
		pendingRafs.push(cb);
	};

	const scheduleWrite = (data: string): void => {
		pendingWrites.push(data);
		if (!rafScheduled) {
			rafScheduled = true;
			mockRaf(() => {
				const batch = pendingWrites.join("");
				pendingWrites.length = 0;
				rafScheduled = false;
				coalescedWriteCalls.push(batch); // xterm.write(batch) — one call per frame
			});
		}
	};

	const flushRaf = (): void => {
		while (pendingRafs.length > 0) {
			const cb = pendingRafs.shift();
			cb?.();
		}
	};

	return {
		writeDirectly,
		scheduleWrite,
		flushRaf,
		directWriteCalls,
		coalescedWriteCalls,
	};
}

describe("xterm.write() coalescing — issue #2241", () => {
	it("current behaviour: N messages in same frame cause N separate xterm.write() calls", () => {
		const model = makeWriteModel();

		// Simulate 5 IPC data messages arriving before the next paint
		const messages = ["agent: ", "running ", "tool...", "\r\n", "done"];
		for (const msg of messages) {
			model.writeDirectly(msg);
		}

		// Bug: every message triggers its own write call
		expect(model.directWriteCalls.length).toBe(5);
	});

	it("fix: N messages in same frame coalesce into one xterm.write() call", () => {
		const model = makeWriteModel();

		const messages = ["agent: ", "running ", "tool...", "\r\n", "done"];
		for (const msg of messages) {
			model.scheduleWrite(msg);
		}

		// Before the RAF fires, nothing has been written yet
		expect(model.coalescedWriteCalls.length).toBe(0);

		// Flush the pending RAF (simulates next animation frame)
		model.flushRaf();

		// After the frame: exactly one write with all data concatenated
		expect(model.coalescedWriteCalls.length).toBe(1);
		expect(model.coalescedWriteCalls[0]).toBe("agent: running tool...\r\ndone");
	});

	it("fix: writes from two separate frames produce two xterm.write() calls", () => {
		const model = makeWriteModel();

		// Frame 1: 3 messages
		model.scheduleWrite("frame1-a");
		model.scheduleWrite("frame1-b");
		model.scheduleWrite("frame1-c");
		model.flushRaf(); // flush frame 1

		// Frame 2: 2 messages
		model.scheduleWrite("frame2-a");
		model.scheduleWrite("frame2-b");
		model.flushRaf(); // flush frame 2

		// Two frames = two write calls (one per frame, not one per message)
		expect(model.coalescedWriteCalls.length).toBe(2);
		expect(model.coalescedWriteCalls[0]).toBe("frame1-aframe1-bframe1-c");
		expect(model.coalescedWriteCalls[1]).toBe("frame2-aframe2-b");
	});

	it("fix: a single message in a frame produces exactly one write", () => {
		const model = makeWriteModel();

		model.scheduleWrite("single");
		model.flushRaf();

		expect(model.coalescedWriteCalls.length).toBe(1);
		expect(model.coalescedWriteCalls[0]).toBe("single");
	});
});
