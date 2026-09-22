import path from "node:path";
import picomatch from "picomatch";

const GLOB_MAGIC = /[*?{}()[\]!+@|]/;

/**
 * Compiles a root-relative ignore list into a predicate over absolute paths.
 * A directory matches when the ignore list covers its contents, so a caller
 * pruning a traversal never descends into it.
 */
export function createIgnoreMatcher(
	rootPath: string,
	ignore: readonly string[],
): (absolutePath: string, isDirectory: boolean | undefined) => boolean {
	const globs = ignore.filter((entry) => GLOB_MAGIC.test(entry));
	const literalPaths = ignore
		.filter((entry) => !GLOB_MAGIC.test(entry))
		.map((entry) => path.resolve(rootPath, entry));
	const matchesGlob =
		globs.length > 0 ? picomatch(globs, { dot: true }) : () => false;

	return (absolutePath, isDirectory) => {
		for (const literal of literalPaths) {
			if (
				absolutePath === literal ||
				absolutePath.startsWith(`${literal}${path.sep}`)
			) {
				return true;
			}
		}
		const relative = path.relative(rootPath, absolutePath);
		if (relative === "" || relative.startsWith("..")) {
			return false;
		}
		const posixRelative =
			path.sep === "/" ? relative : relative.split(path.sep).join("/");
		if (matchesGlob(posixRelative)) {
			return true;
		}
		return isDirectory !== false && matchesGlob(`${posixRelative}/_`);
	};
}
