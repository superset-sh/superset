import { join, resolve, sep } from "node:path";
import { transform } from "sucrase";

/**
 * Pure widget compile + path-resolution helpers. Kept free of Electron
 * main-process imports (no app-state, local-db, etc.) so they can be unit
 * tested with `bun test` — workspace-card-widgets.ts re-exports them.
 */

export interface CompiledWidget {
	/** CJS module source, ready for `new Function("require","module","exports", code)`. */
	code: string;
	/** Content hash of the source — drives renderer re-evaluation and the cache. */
	hash: string;
}

/** Stable, dependency-free content hash (djb2). Sufficient for a cache/version key. */
export function hashSource(source: string): string {
	let h = 5381;
	for (let i = 0; i < source.length; i++) {
		h = ((h << 5) + h + source.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}

/**
 * Compiles widget TSX to CommonJS via sucrase: TypeScript + JSX (classic
 * runtime → `React.createElement`) + import→require rewriting. The renderer
 * runs the result through a sandboxed require shim. Throws on a syntax error so
 * the caller surfaces it as a clear compile error.
 */
export function compileWidgetSource(source: string): CompiledWidget {
	const { code } = transform(source, {
		transforms: ["typescript", "jsx", "imports"],
		jsxRuntime: "classic",
		production: true,
	});
	return { code, hash: hashSource(source) };
}

/**
 * Resolves a widget `file` (a `.superset/`-relative path from the config) to an
 * absolute path under `<repo>/.superset/`, rejecting anything that escapes that
 * directory. Returns null when the path traverses out (defense in depth on top
 * of the zod-level guard) — the file may legitimately not exist yet.
 */
export function resolveWidgetFilePath(
	repoPath: string,
	file: string,
): string | null {
	const supersetDir = resolve(join(repoPath, ".superset"));
	const candidate = resolve(join(supersetDir, file));
	// Containment check: candidate must live inside .superset/.
	if (candidate !== supersetDir && !candidate.startsWith(supersetDir + sep)) {
		return null;
	}
	return candidate;
}
