import { type RefObject, useLayoutEffect, useState } from "react";

export interface WorkspaceColumnVisibility {
	host: boolean;
	branch: boolean;
	created: boolean;
}

export interface WorkspaceColumns {
	columns: WorkspaceColumnVisibility;
	/** Total rendered columns — feeds the project-group row's colSpan. */
	columnCount: number;
}

// Pin, name, and actions always render.
const BASE_COLUMN_COUNT = 3;

// Optional columns appear once the list container itself (not the window —
// the resizable sidebar makes viewport breakpoints lie) is wide enough.
const HOST_MIN_WIDTH = 512;
const BRANCH_MIN_WIDTH = 768;
const CREATED_MIN_WIDTH = 1024;

/**
 * Decides which optional table columns fit the list container. Rendering
 * (not CSS-hiding) columns from one measured width keeps the project-group
 * row's colSpan in sync with the real column count — a colSpan larger than
 * the rendered columns makes `table-fixed` mint a phantom empty column that
 * steals half the Name column's flexible width.
 */
export function useWorkspaceColumns(
	containerRef: RefObject<HTMLElement | null>,
): WorkspaceColumns {
	const [width, setWidth] = useState<number | null>(null);

	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		setWidth(element.clientWidth);
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [containerRef]);

	// Until the first measurement, assume wide so the common case doesn't flash.
	const measured = width ?? Number.POSITIVE_INFINITY;
	const columns: WorkspaceColumnVisibility = {
		host: measured >= HOST_MIN_WIDTH,
		branch: measured >= BRANCH_MIN_WIDTH,
		created: measured >= CREATED_MIN_WIDTH,
	};
	const columnCount =
		BASE_COLUMN_COUNT +
		Number(columns.host) +
		Number(columns.branch) +
		Number(columns.created);

	return { columns, columnCount };
}
