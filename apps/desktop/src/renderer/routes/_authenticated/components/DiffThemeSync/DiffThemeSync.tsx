import { useWorkerPool } from "@pierre/diffs/react";
import { useEffect } from "react";
import { useResolvedTheme } from "renderer/stores/theme";
import { buildDiffPoolRenderOptions } from "./buildDiffPoolRenderOptions";

/**
 * Drives the @pierre/diffs worker pool's theme from the active Superset theme.
 * Under a worker pool the renderer ignores each CodeView item's `theme`, so it
 * must be pushed onto the pool via setRenderOptions. Must be mounted inside
 * WorkerPoolContextProvider.
 */
export function DiffThemeSync() {
	const poolManager = useWorkerPool();
	const activeTheme = useResolvedTheme();

	useEffect(() => {
		poolManager
			?.setRenderOptions(buildDiffPoolRenderOptions(activeTheme))
			.catch((error) => {
				console.error(
					"[DiffThemeSync] Failed to apply theme to diff pool:",
					error,
				);
			});
	}, [poolManager, activeTheme]);

	return null;
}
