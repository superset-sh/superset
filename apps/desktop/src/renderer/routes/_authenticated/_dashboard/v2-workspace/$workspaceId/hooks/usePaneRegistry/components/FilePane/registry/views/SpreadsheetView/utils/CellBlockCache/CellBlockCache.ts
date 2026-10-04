import type { CellRange, CellWindow, GridCell } from "../../types";

type Rows = (GridCell | null)[][];

interface Block {
	rows: Rows;
	size: number;
}

export const BLOCK_ROWS = 256;
export const BLOCK_COLS = 64;
const MAX_CELLS = 400_000;

export interface CellBlockEvents {
	onVisibleLoad: () => void;
	/** A visible block failed twice in a row. */
	onVisibleError: (error: unknown) => void;
}

const blockKey = (rowBlock: number, colBlock: number) =>
	`${rowBlock}:${colBlock}`;

/**
 * Cells of one sheet fetched from the worker in blocks of rows by columns,
 * least recently used first. The blocks of the last `ensure` call are the
 * visible ones: they are never evicted, and only their arrival repaints.
 * A visible block that fails is fetched once more before it is reported.
 */
export class CellBlockCache {
	private blocks = new Map<string, Block>();
	private pending = new Set<string>();
	private visible = new Set<string>();
	private cells = 0;
	private disposed = false;

	constructor(
		private readonly fetchCells: (window: CellWindow) => Promise<Rows>,
		private readonly events: CellBlockEvents,
		private readonly maxCells = MAX_CELLS,
	) {}

	/** undefined while the cell's block is still loading. */
	getCell(row: number, col: number): GridCell | null | undefined {
		const block = this.blocks.get(
			blockKey(Math.floor(row / BLOCK_ROWS), Math.floor(col / BLOCK_COLS)),
		);
		if (!block) return undefined;
		return block.rows[row % BLOCK_ROWS]?.[col % BLOCK_COLS] ?? null;
	}

	ensure(ranges: CellRange[]): void {
		this.visible = new Set();
		for (const range of ranges) {
			const firstRow = Math.floor(Math.max(0, range.top) / BLOCK_ROWS);
			const lastRow = Math.floor(Math.max(0, range.bottom) / BLOCK_ROWS);
			const firstCol = Math.floor(Math.max(0, range.left) / BLOCK_COLS);
			const lastCol = Math.floor(Math.max(0, range.right) / BLOCK_COLS);
			for (let r = firstRow; r <= lastRow; r += 1) {
				for (let c = firstCol; c <= lastCol; c += 1) this.request(r, c);
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.blocks.clear();
	}

	private request(rowBlock: number, colBlock: number): void {
		const key = blockKey(rowBlock, colBlock);
		this.visible.add(key);
		const block = this.blocks.get(key);
		if (block) {
			this.blocks.delete(key);
			this.blocks.set(key, block);
			return;
		}
		if (this.pending.has(key)) return;
		this.load(key, {
			rowStart: rowBlock * BLOCK_ROWS,
			rowEnd: (rowBlock + 1) * BLOCK_ROWS,
			colStart: colBlock * BLOCK_COLS,
			colEnd: (colBlock + 1) * BLOCK_COLS,
		});
	}

	private load(key: string, window: CellWindow, retried = false): void {
		this.pending.add(key);
		this.fetchCells(window).then(
			(rows) => {
				this.pending.delete(key);
				if (this.disposed) return;
				const size = rows.reduce((sum, row) => sum + row.length + 1, 0);
				this.blocks.set(key, { rows, size });
				this.cells += size;
				this.evict();
				if (this.visible.has(key)) this.events.onVisibleLoad();
			},
			(error: unknown) => {
				this.pending.delete(key);
				if (this.disposed || !this.visible.has(key)) return;
				if (retried) this.events.onVisibleError(error);
				else this.load(key, window, true);
			},
		);
	}

	private evict(): void {
		for (const [key, block] of this.blocks) {
			if (this.cells <= this.maxCells) return;
			if (this.visible.has(key)) continue;
			this.blocks.delete(key);
			this.cells -= block.size;
		}
	}
}
