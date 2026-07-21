import type { FileTree } from "@pierre/trees";
import { useEffect, useState } from "react";

/**
 * Pierre's virtualized host renders `height: 100%`, which collapses to 0 inside
 * an auto-height container — so the tree would be invisible. Pierre also writes
 * the true content height (rendered rows × itemHeight, *after* it flattens
 * single-child directory chains into one row) to the virtualized list's inline
 * `style.height`; this hook mirrors that value so the caller can size the host
 * explicitly. A naive `dirs + files` count would massively over-estimate
 * because it doesn't know about flattening. Returns `null` until Pierre has
 * rendered (caller should fall back to an estimate meanwhile).
 */
export function useMeasuredTreeHeight(model: FileTree): number | null {
	const [height, setHeight] = useState<number | null>(null);
	useEffect(() => {
		const readHeight = (): boolean => {
			const list = model
				.getFileTreeContainer()
				?.shadowRoot?.querySelector<HTMLElement>(
					"[data-file-tree-virtualized-list]",
				);
			const h = list ? Number.parseFloat(list.style.height) : Number.NaN;
			if (Number.isFinite(h) && h > 0) {
				setHeight(h);
				return true;
			}
			return false;
		};
		let raf = 0;
		let attempts = 0;
		const retryUntilReady = () => {
			if (readHeight() || attempts++ > 30) return;
			raf = requestAnimationFrame(retryUntilReady);
		};
		retryUntilReady();
		// Pierre rewrites `style.height` when the rendered row count changes
		// (resetPaths, expand/collapse); re-read on the next frame after each.
		const unsubscribe = model.subscribe(() => {
			raf = requestAnimationFrame(readHeight);
		});
		return () => {
			cancelAnimationFrame(raf);
			unsubscribe();
		};
	}, [model]);
	return height;
}
