// Glob patterns hidden from the workspace file tree. Users edit this list in
// Settings > Appearance; the tree filters against it client-side.
export const DEFAULT_FILE_TREE_HIDDEN_PATTERNS = [
	".git",
	"node_modules",
	".DS_Store",
];

export const MAX_FILE_TREE_HIDDEN_PATTERNS = 200;
export const MAX_FILE_TREE_HIDDEN_PATTERN_LENGTH = 200;

interface CompiledPattern {
	regex: RegExp;
	directoriesOnly: boolean;
	matchesBasename: boolean;
}

function escapeLiteral(segment: string): string {
	return segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

// Translates a gitignore-flavored glob into a regex source string. `**` spans
// separators, `*` and `?` stop at them.
function globToRegexSource(pattern: string): string {
	let source = "";
	let index = 0;

	while (index < pattern.length) {
		if (pattern.startsWith("**/", index)) {
			source += "(?:.*/)?";
			index += 3;
			continue;
		}

		if (pattern.startsWith("**", index)) {
			source += ".*";
			index += 2;
			continue;
		}

		const character = pattern[index];
		if (character === "*") {
			source += "[^/]*";
		} else if (character === "?") {
			source += "[^/]";
		} else {
			source += escapeLiteral(character);
		}
		index += 1;
	}

	return source;
}

function compilePattern(rawPattern: string): CompiledPattern | null {
	let pattern = rawPattern.trim();
	if (!pattern || pattern.startsWith("#")) {
		return null;
	}

	const directoriesOnly = pattern.endsWith("/");
	if (directoriesOnly) {
		pattern = pattern.slice(0, -1);
	}

	// A leading slash anchors the pattern to the workspace root; without one a
	// separator-free pattern matches a basename at any depth.
	const isAnchored = pattern.startsWith("/");
	if (isAnchored) {
		pattern = pattern.slice(1);
	}

	if (!pattern) {
		return null;
	}

	const matchesBasename = !isAnchored && !pattern.includes("/");

	try {
		return {
			regex: new RegExp(`^${globToRegexSource(pattern)}$`),
			directoriesOnly,
			matchesBasename,
		};
	} catch {
		return null;
	}
}

export interface FileTreeEntryForMatch {
	name: string;
	relativePath: string;
	isDirectory: boolean;
}

export type FileTreeHiddenMatcher = (entry: FileTreeEntryForMatch) => boolean;

// Returns a matcher that reports whether an entry should be hidden. An empty or
// fully invalid pattern list yields a matcher that hides nothing.
export function createFileTreeHiddenMatcher(
	patterns: string[],
): FileTreeHiddenMatcher {
	const compiled = patterns
		.map(compilePattern)
		.filter((entry): entry is CompiledPattern => entry !== null);

	if (compiled.length === 0) {
		return () => false;
	}

	return ({ relativePath, isDirectory }) => {
		const normalizedPath = relativePath.replace(/\\/g, "/");
		const segments = normalizedPath.split("/").filter(Boolean);

		return compiled.some((pattern) => {
			return segments.some((segment, index) => {
				const candidateIsDirectory = index < segments.length - 1 || isDirectory;
				if (pattern.directoriesOnly && !candidateIsDirectory) {
					return false;
				}

				const candidatePath = segments.slice(0, index + 1).join("/");
				return pattern.matchesBasename
					? pattern.regex.test(segment)
					: pattern.regex.test(candidatePath);
			});
		});
	};
}
