import { getDiffsTheme } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import type { Theme } from "shared/themes";

/**
 * Builds the render options the @pierre/diffs worker pool should run with for a
 * given Superset theme.
 *
 * Under a worker pool, the renderer ignores the per-CodeView-item options and
 * uses the pool's render options instead (see DiffHunksRenderer.getRenderOptions).
 * So these values must be driven onto the pool via WorkerPoolManager.setRenderOptions
 * to take effect. The tokenize/diff fields restate Superset's intent from
 * useDiffCodeViewTheme so the pool matches the per-item config it would otherwise
 * use without a pool.
 *
 * `tokenizeMaxLength` is intentionally omitted: it is not part of the pool's
 * render options (setRenderOptions only accepts theme/useTokenTransformer/
 * lineDiffType/maxLineDiffLength/tokenizeMaxLineLength), so passing it would be
 * silently ignored.
 */
export function buildDiffPoolRenderOptions(activeTheme: Theme) {
	return {
		theme: getDiffsTheme(activeTheme),
		lineDiffType: "word-alt" as const,
		maxLineDiffLength: 5_000,
		tokenizeMaxLineLength: 5_000,
	};
}
