import type { RenderDiffOptions } from "@pierre/diffs";

/**
 * Diff render options governed by the @pierre/diffs worker pool.
 *
 * Under a worker pool the renderer ignores each CodeView item's copy of these
 * options and uses the pool's values instead. Keeping them in one place lets the
 * per-item config (useDiffCodeViewTheme) and the pool config
 * (buildDiffPoolRenderOptions) share a single source of truth so they can't
 * silently diverge.
 *
 * - `lineDiffType: "word-alt"` matches the library default; kept explicit so the
 *   pool and per-item paths provably agree.
 * - The length caps degrade gracefully on lockfiles / minified bundles instead
 *   of blocking the worker.
 */
export const DIFF_POOL_RENDER_OPTIONS = {
	lineDiffType: "word-alt",
	maxLineDiffLength: 5_000,
	tokenizeMaxLineLength: 5_000,
} as const satisfies Partial<RenderDiffOptions>;
