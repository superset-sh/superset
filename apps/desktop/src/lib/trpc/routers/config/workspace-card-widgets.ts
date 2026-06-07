import {
	existsSync,
	type FSWatcher,
	readFileSync,
	statSync,
	watch,
} from "node:fs";
import { join } from "node:path";
import { resolveWorkspaceCardRepoPath } from "./workspace-card-source";
import {
	type CompiledWidget,
	compileWidgetSource,
	resolveWidgetFilePath,
} from "./workspace-card-widget-compile";

export {
	type CompiledWidget,
	compileWidgetSource,
	resolveWidgetFilePath,
} from "./workspace-card-widget-compile";

/**
 * Reads a widget file's raw source. Returns null when the path traverses out,
 * the file is missing, or it isn't a regular file. Never throws.
 */
export function readWidgetSource(
	repoPath: string,
	file: string,
): string | null {
	const abs = resolveWidgetFilePath(repoPath, file);
	if (!abs) return null;
	try {
		if (!statSync(abs).isFile()) return null;
		return readFileSync(abs, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Reads the source of every requested widget file, keyed by the original
 * `.superset/`-relative path. Missing/blocked files map to null. Used to fold
 * widget contents into the trust hash so editing a widget body re-arms consent.
 */
export function readWidgetSources(
	repoPath: string,
	files: string[],
): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (const file of files) {
		out[file] = readWidgetSource(repoPath, file);
	}
	return out;
}

interface CacheEntry {
	source: string;
	compiled: CompiledWidget;
}

// Keyed by absolute file path. Avoids recompiling unchanged widget sources on
// every getWidgetModule call (cards remount often).
const compileCache = new Map<string, CacheEntry>();

/**
 * Resolves, reads, and compiles a widget file (content-hash cached). Returns
 * null when the file can't be resolved or read; throws when it exists but fails
 * to compile (the caller maps that to an error indicator).
 */
export function loadCompiledWidget(
	repoPath: string,
	file: string,
): CompiledWidget | null {
	const abs = resolveWidgetFilePath(repoPath, file);
	if (!abs) return null;
	let source: string;
	try {
		if (!statSync(abs).isFile()) return null;
		source = readFileSync(abs, "utf-8");
	} catch {
		return null;
	}
	const cached = compileCache.get(abs);
	if (cached && cached.source === source) {
		return cached.compiled;
	}
	const compiled = compileWidgetSource(source);
	compileCache.set(abs, { source, compiled });
	return compiled;
}

const WATCH_DEBOUNCE_MS = 250;

/**
 * Watches `<repoPath>/.superset/widgets/` (recursively) for changes, debounced.
 * When the directory doesn't exist yet, watches `.superset/` for its creation
 * and re-arms. Returns a cleanup function. Mirrors watchWorkspaceCardConfigFile
 * so widget edits live-reload the same way config edits do.
 */
export function watchWorkspaceCardWidgetsDir(
	repoPath: string,
	onChange: () => void,
): () => void {
	const supersetDir = join(repoPath, ".superset");
	const widgetsDir = join(supersetDir, "widgets");
	let widgetsWatcher: FSWatcher | null = null;
	let supersetWatcher: FSWatcher | null = null;
	let debounce: NodeJS.Timeout | null = null;
	let closed = false;

	const fire = () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			debounce = null;
			onChange();
		}, WATCH_DEBOUNCE_MS);
	};

	const watchWidgets = () => {
		if (closed || widgetsWatcher) return;
		try {
			widgetsWatcher = watch(widgetsDir, { recursive: true }, () => fire());
			widgetsWatcher.on("error", () => {
				widgetsWatcher?.close();
				widgetsWatcher = null;
			});
		} catch {
			// Directory vanished between the existence check and the watch.
		}
	};

	if (existsSync(widgetsDir)) {
		watchWidgets();
	} else if (existsSync(supersetDir)) {
		try {
			supersetWatcher = watch(supersetDir, (_event, filename) => {
				if (filename !== "widgets" || !existsSync(widgetsDir)) return;
				watchWidgets();
				supersetWatcher?.close();
				supersetWatcher = null;
				fire();
			});
			supersetWatcher.on("error", () => {
				supersetWatcher?.close();
				supersetWatcher = null;
			});
		} catch {
			// .superset disappeared — nothing to watch.
		}
	}

	return () => {
		closed = true;
		if (debounce) clearTimeout(debounce);
		widgetsWatcher?.close();
		supersetWatcher?.close();
	};
}

/**
 * Convenience: resolve a project's repo path and read a widget file relative to
 * the repo. Returns null when the project has no local checkout. Re-exported
 * shape keeps callers from importing the resolver directly.
 */
export function readProjectWidgetSources(
	projectId: string,
	files: string[],
): Record<string, string | null> {
	const repoPath = resolveWorkspaceCardRepoPath(projectId);
	if (!repoPath) {
		return Object.fromEntries(files.map((f) => [f, null]));
	}
	return readWidgetSources(repoPath, files);
}
