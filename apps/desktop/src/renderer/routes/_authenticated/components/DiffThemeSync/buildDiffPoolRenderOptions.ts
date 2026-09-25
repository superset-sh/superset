import {
	DIFF_POOL_RENDER_OPTIONS,
	getDiffsTheme,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import type { Theme } from "shared/themes";

/**
 * Builds the render options the @pierre/diffs worker pool should run with for a
 * given Superset theme.
 *
 * Under a worker pool the renderer ignores the per-CodeView-item options and
 * uses the pool's render options instead (see DiffHunksRenderer.getRenderOptions),
 * so these must be driven onto the pool via WorkerPoolManager.setRenderOptions to
 * take effect. The diff/tokenize options come from DIFF_POOL_RENDER_OPTIONS — the
 * same source useDiffCodeViewTheme uses for its per-item config — so the pool and
 * per-item options can't silently diverge.
 */
export function buildDiffPoolRenderOptions(activeTheme: Theme) {
	return {
		theme: getDiffsTheme(activeTheme),
		...DIFF_POOL_RENDER_OPTIONS,
	};
}
