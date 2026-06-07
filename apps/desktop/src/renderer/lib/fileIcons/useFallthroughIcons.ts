import type { FileTree } from "@pierre/trees";
import { useEffect } from "react";
import { loadFallthroughIcons } from "./loadFallthroughIcons";

/**
 * Layers our Material-icon fallthrough coverage onto a `@pierre/trees` model
 * once the icon sprite has loaded: file types Pierre's built-in `complete` set
 * doesn't recognize (`.toml`, `.lock`, framework dirs, …) plus a Material
 * default-file icon for anything still unmatched. The model renders with
 * Pierre's defaults first; ours fill in async. The cache inside
 * `loadFallthroughIcons` makes repeat mounts a no-op.
 */
export function useFallthroughIcons(model: FileTree): void {
	useEffect(() => {
		let cancelled = false;
		void loadFallthroughIcons().then((config) => {
			if (cancelled) return;
			model.setIcons({ set: "complete", colored: true, ...config });
		});
		return () => {
			cancelled = true;
		};
	}, [model]);
}
