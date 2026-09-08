"use client";

import "react-grid-layout/css/styles.css";

import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactGridLayout, {
	type Layout,
	type LayoutItem,
} from "react-grid-layout";
import { LuGripHorizontal } from "react-icons/lu";
import { useElementWidth } from "../../hooks/useElementWidth";

import { useGrowthLayout } from "../../providers/GrowthLayoutProvider";

export interface GridTile {
	key: string;
	node: ReactNode;
	// Width in twelfths of the row; height in grid rows (ROW_HEIGHT px each).
	w?: number;
	h?: number;
}

interface TileGridProps {
	section: string;
	tiles: GridTile[];
}

const COLS = 12;
const ROW_HEIGHT = 20;
const MARGIN: [number, number] = [24, 24];
const DEFAULT_W = 6;
const DEFAULT_H = 13;
const MIN_W = 3;
const MIN_H = 8;
// Below this width the grid is one column and tiles stack in order.
const STACK_BELOW_PX = 900;

function defaultLayout(tiles: GridTile[], cols: number): Layout {
	let x = 0;
	let y = 0;
	let rowHeight = 0;
	const layout: LayoutItem[] = [];
	for (const tile of tiles) {
		const w = Math.min(cols, tile.w ?? DEFAULT_W);
		const h = tile.h ?? DEFAULT_H;
		if (x + w > cols) {
			x = 0;
			y += rowHeight;
			rowHeight = 0;
		}
		layout.push({ i: tile.key, x, y, w, h, minW: MIN_W, minH: MIN_H });
		x += w;
		rowHeight = Math.max(rowHeight, h);
	}
	return layout;
}

// Merge a stored layout with the current tile set: tiles added since the
// layout was saved get their default slot below everything else, and tiles
// that no longer exist are dropped.
function reconcile(stored: Layout, tiles: GridTile[], cols: number): Layout {
	const known = new Set(tiles.map((t) => t.key));
	const kept = stored.filter((item) => known.has(item.i));
	const missing = tiles.filter((t) => !kept.some((item) => item.i === t.key));
	const bottom = kept.reduce((max, item) => Math.max(max, item.y + item.h), 0);
	const extra = defaultLayout(missing, cols).map((item) => ({
		...item,
		y: item.y + bottom,
	}));
	return [...kept, ...extra];
}

function sameLayout(a: Layout, b: Layout): boolean {
	if (a.length !== b.length) return false;
	return a.every((item, i) => {
		const other = b[i];
		return (
			other !== undefined &&
			item.i === other.i &&
			item.x === other.x &&
			item.y === other.y &&
			item.w === other.w &&
			item.h === other.h
		);
	});
}

export function TileGrid({ section, tiles }: TileGridProps) {
	const { t } = useLingui();
	// Measured here rather than with the library's hook, whose fallback width
	// (1280) is wider than the content column and drew the grid over the edge.
	const containerRef = useRef<HTMLDivElement>(null);
	const width = useElementWidth(containerRef);
	const mounted = width > 0;
	const { version, readLayout, writeLayout } = useGrowthLayout();
	const stacked = width < STACK_BELOW_PX;
	const cols = stacked ? 1 : COLS;

	const [layout, setLayout] = useState<Layout>(() =>
		defaultLayout(tiles, COLS),
	);

	// Stored arrangement, or the default, whenever the tile set or reset
	// version changes. Stored layouts only apply to the wide grid: stacked
	// tiles keep their default order. Tiles are read through a ref because the
	// array is rebuilt every render; the joined keys are the change signal.
	const tilesRef = useRef(tiles);
	tilesRef.current = tiles;
	const tileKeys = tiles.map((tile) => tile.key).join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: version and tileKeys are the change signals; tiles come through the ref
	useEffect(() => {
		const stored = readLayout(section);
		const current = tilesRef.current;
		setLayout(
			stored ? reconcile(stored, current, COLS) : defaultLayout(current, COLS),
		);
	}, [section, version, tileKeys, readLayout]);

	const activeLayout = useMemo(
		() =>
			stacked
				? defaultLayout(tiles, 1).map((item) => ({ ...item, w: 1, x: 0 }))
				: layout,
		[stacked, tiles, layout],
	);

	return (
		<div ref={containerRef}>
			{mounted ? (
				<ReactGridLayout
					layout={activeLayout}
					width={width}
					gridConfig={{
						cols,
						rowHeight: ROW_HEIGHT,
						margin: MARGIN,
						containerPadding: [0, 0],
					}}
					dragConfig={{
						enabled: !stacked,
						handle: ".tile-drag-handle",
					}}
					resizeConfig={{ enabled: !stacked, handles: ["se"] }}
					onLayoutChange={(next) => {
						// The grid reports its layout on every render, not only on a
						// drag or resize; storing an equal copy would re-render forever.
						if (stacked || sameLayout(next, layout)) return;
						setLayout(next);
						writeLayout(section, next);
					}}
				>
					{tiles.map((tile) => (
						<div
							key={tile.key}
							className={cn(
								"group/tile relative h-full overflow-hidden [&>*]:h-full",
								"[&_.react-resizable-handle]:z-10",
							)}
						>
							{tile.node}
							{stacked ? null : (
								<div
									className="tile-drag-handle text-muted-foreground absolute top-1 left-1/2 z-10 -translate-x-1/2 cursor-grab rounded px-2 opacity-0 transition-opacity group-hover/tile:opacity-100 active:cursor-grabbing"
									title={t({ message: "Drag to move" })}
								>
									<LuGripHorizontal className="size-4" />
								</div>
							)}
						</div>
					))}
				</ReactGridLayout>
			) : null}
		</div>
	);
}
