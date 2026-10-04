import { expect, test } from "bun:test";
import type { CellWindow, GridCell } from "../../types";
import { BLOCK_COLS, BLOCK_ROWS, CellBlockCache } from "./CellBlockCache";

type Rows = (GridCell | null)[][];

interface Request {
	window: CellWindow;
	resolve: (rows: Rows) => void;
	reject: (error: Error) => void;
}

function deferredFetcher() {
	const requests: Request[] = [];
	const fetch = (window: CellWindow) =>
		new Promise<Rows>((resolve, reject) =>
			requests.push({ window, resolve, reject }),
		);
	const fill = (window: CellWindow): Rows =>
		Array.from({ length: window.rowEnd - window.rowStart }, (_, r) =>
			Array.from({ length: 2 }, (_, c) => ({
				text: `${window.rowStart + r}:${window.colStart + c}`,
				kind: "text" as const,
			})),
		);
	return { requests, fetch, fill };
}

const cell = (row: number, col: number) => ({
	top: row,
	left: col,
	bottom: row,
	right: col,
});

test("fetches each block once, by rows and by a window of columns", async () => {
	const { requests, fetch, fill } = deferredFetcher();
	let loads = 0;
	const cache = new CellBlockCache(fetch, {
		onVisibleLoad: () => {
			loads += 1;
		},
		onVisibleError: () => {},
	});
	cache.ensure([{ top: 0, left: 0, bottom: BLOCK_ROWS + 1, right: 1 }]);
	cache.ensure([
		{ top: 10, left: BLOCK_COLS + 3, bottom: 20, right: BLOCK_COLS + 3 },
	]);
	cache.ensure([cell(5, 0)]);
	expect(requests.map((request) => request.window)).toEqual([
		{ rowStart: 0, rowEnd: BLOCK_ROWS, colStart: 0, colEnd: BLOCK_COLS },
		{
			rowStart: BLOCK_ROWS,
			rowEnd: BLOCK_ROWS * 2,
			colStart: 0,
			colEnd: BLOCK_COLS,
		},
		{
			rowStart: 0,
			rowEnd: BLOCK_ROWS,
			colStart: BLOCK_COLS,
			colEnd: BLOCK_COLS * 2,
		},
	]);
	expect(cache.getCell(5, 0)).toBeUndefined();
	for (const request of requests) request.resolve(fill(request.window));
	await Promise.resolve();
	expect(cache.getCell(BLOCK_ROWS + 1, 1)?.text).toBe(`${BLOCK_ROWS + 1}:1`);
	expect(cache.getCell(5, 3)).toBeNull();
	expect(loads).toBe(1);
});

test("a late block never evicts the visible one and only a visible block repaints", async () => {
	const { requests, fetch, fill } = deferredFetcher();
	let loads = 0;
	const cache = new CellBlockCache(
		fetch,
		{
			onVisibleLoad: () => {
				loads += 1;
			},
			onVisibleError: () => {},
		},
		BLOCK_ROWS * 2,
	);
	const far = BLOCK_ROWS * 40;
	cache.ensure([cell(0, 0)]);
	cache.ensure([cell(far, 0)]);
	const [stale, visible] = requests;
	visible?.resolve(fill(visible.window));
	await Promise.resolve();
	expect(loads).toBe(1);
	stale?.resolve(fill(stale.window));
	await Promise.resolve();
	expect(loads).toBe(1);
	expect(cache.getCell(far, 1)?.text).toBe(`${far}:1`);
	expect(cache.getCell(0, 0)).toBeUndefined();
});

test("a visible block that fails is fetched once more, then reported", async () => {
	const { requests, fetch, fill } = deferredFetcher();
	const errors: unknown[] = [];
	const cache = new CellBlockCache(fetch, {
		onVisibleLoad: () => {},
		onVisibleError: (error) => errors.push(error),
	});
	cache.ensure([cell(0, 0)]);
	requests[0]?.reject(new Error("first"));
	await Promise.resolve();
	expect(requests).toHaveLength(2);
	expect(errors).toEqual([]);
	requests[1]?.reject(new Error("second"));
	await Promise.resolve();
	expect(requests).toHaveLength(2);
	expect(errors).toEqual([new Error("second")]);

	cache.ensure([cell(BLOCK_ROWS, 0)]);
	requests[2]?.reject(new Error("off screen"));
	cache.ensure([cell(0, 0)]);
	await Promise.resolve();
	expect(requests).toHaveLength(4);
	requests[3]?.resolve(fill(requests[3].window));
	await Promise.resolve();
	expect(cache.getCell(0, 1)?.text).toBe("0:1");
	expect(errors).toHaveLength(1);
});
