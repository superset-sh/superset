import { afterEach, expect, test } from "bun:test";
import type { TranscriptRow } from "../../utils/transcriptRows";
import { rowHeightsFor } from "./utils/rowHeights";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useTranscriptWindow } = await import("./useTranscriptWindow");

afterEach(cleanup);

function rows(count: number, prefix = "row"): TranscriptRow[] {
	return Array.from({ length: count }, (_, index) => ({
		kind: "item",
		key: `${prefix}-${index}`,
		groupStart: true,
		item: {
			id: `item-${index}`,
			kind: "user_message",
			clientId: `client-${index}`,
			startedAtMs: index,
			content: [],
		},
	}));
}

const observeRow = () => () => {};

function renderWindow(
	initial: { rows: TranscriptRow[]; pinned?: (string | null)[] },
	sessionId = crypto.randomUUID(),
	viewport: HTMLElement | null = null,
) {
	return renderHook(
		({ rows, pinned }: { rows: TranscriptRow[]; pinned?: (string | null)[] }) =>
			useTranscriptWindow({
				rows,
				viewport,
				sessionId,
				pinnedRowKeys: pinned ?? [],
				observeRow,
			}),
		{ initialProps: initial },
	);
}

test("mounts the last 40 rows and keeps them when more rows stream in", () => {
	const { result, rerender } = renderWindow({ rows: rows(100) });
	expect(result.current.startIndex).toBe(60);

	rerender({ rows: rows(110) });
	expect(result.current.startIndex).toBe(60);
});

test("extends the window to a pinned row and keeps it after the pin clears", () => {
	const { result, rerender } = renderWindow({ rows: rows(100) });
	rerender({ rows: rows(100), pinned: ["row-10"] });
	expect(result.current.startIndex).toBe(10);

	rerender({ rows: rows(100), pinned: [] });
	expect(result.current.startIndex).toBe(10);
});

test("sizes the spacer from the heights measured for this session", () => {
	const sessionId = crypto.randomUUID();
	const heights = rowHeightsFor(sessionId);
	for (let index = 0; index < 60; index++) heights.set(`row-${index}`, 50);

	const { result } = renderWindow({ rows: rows(100) }, sessionId);
	expect(result.current.spacerHeight).toBe(60 * 50);
});

test("keeps revealed rows mounted when the first row's key changes", () => {
	const { result, rerender } = renderWindow({ rows: rows(100) });
	rerender({ rows: rows(100), pinned: ["row-0"] });
	rerender({ rows: rows(100) });
	expect(result.current.startIndex).toBe(0);

	const rekeyed = [...rows(20, "older"), ...rows(100)];
	rekeyed[20] = { ...rekeyed[20], key: "row-0-rekeyed" } as TranscriptRow;
	rerender({ rows: rekeyed });
	expect(result.current.startIndex).toBe(0);
});

type Fired = { callback: (entries: unknown[]) => void };

function installObservers() {
	const intersections: Fired[] = [];
	const resizes: Fired[] = [];
	const original = {
		IntersectionObserver: globalThis.IntersectionObserver,
		ResizeObserver: globalThis.ResizeObserver,
	};
	const fake = (list: Fired[]) =>
		class {
			constructor(callback: (entries: unknown[]) => void) {
				list.push({ callback });
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	Object.assign(globalThis, {
		IntersectionObserver: fake(intersections),
		ResizeObserver: fake(resizes),
	});
	return {
		intersections,
		resizes,
		restore: () => Object.assign(globalThis, original),
	};
}

test("mounts 40 older rows when the spacer nears the viewport", () => {
	const observers = installObservers();
	try {
		const viewport = document.createElement("div");
		const { result } = renderWindow(
			{ rows: rows(100) },
			crypto.randomUUID(),
			viewport,
		);
		expect(result.current.startIndex).toBe(60);
		act(() => result.current.spacerRef(document.createElement("div")));
		act(() => {
			observers.intersections.at(-1)?.callback([{ isIntersecting: true }]);
		});
		expect(result.current.startIndex).toBe(20);
	} finally {
		observers.restore();
	}
});

test("records the measured height of a mounted row for the session", () => {
	const observers = installObservers();
	try {
		const sessionId = crypto.randomUUID();
		const { result } = renderWindow({ rows: rows(100) }, sessionId);
		const row = document.createElement("div");
		act(() => result.current.rowRef("row-70")(row));
		act(() => {
			observers.resizes
				.at(-1)
				?.callback([{ target: row, borderBoxSize: [{ blockSize: 77 }] }]);
		});
		expect(rowHeightsFor(sessionId).get("row-70")).toBe(77);
	} finally {
		observers.restore();
	}
});

test("goes back to the newest 40 rows when asked to reset", () => {
	const { result, rerender } = renderWindow({ rows: rows(100) });
	rerender({ rows: rows(100), pinned: ["row-0"] });
	rerender({ rows: rows(100) });
	expect(result.current.startIndex).toBe(0);

	act(() => result.current.resetToTail());
	expect(result.current.startIndex).toBe(60);
});

test("holds reveals while a jump scrolls, then resumes when the scroll ends", () => {
	const observers = installObservers();
	try {
		const viewport = document.createElement("div");
		const { result } = renderWindow(
			{ rows: rows(100) },
			crypto.randomUUID(),
			viewport,
		);
		act(() => result.current.spacerRef(document.createElement("div")));
		act(() => result.current.holdRevealUntilScrollEnds());
		act(() => {
			observers.intersections.at(-1)?.callback([{ isIntersecting: true }]);
		});
		expect(result.current.startIndex).toBe(60);

		act(() => {
			viewport.dispatchEvent(new Event("scrollend"));
		});
		act(() => {
			observers.intersections.at(-1)?.callback([{ isIntersecting: true }]);
		});
		expect(result.current.startIndex).toBe(20);
	} finally {
		observers.restore();
	}
});
