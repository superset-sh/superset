export interface LocalImageBase {
	/** Directory of the markdown file; relative sources resolve against it. */
	documentDirectory: string;
	/**
	 * Workspace root. A leading-slash source resolves against it, the way a
	 * README renders on GitHub; without a root it is a filesystem path.
	 */
	rootPath?: string;
}

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_DRIVE_PATH = /^[a-z]:[\\/]/i;
const WINDOWS_DRIVE_ROOT = /^[a-z]:\//i;
const WINDOWS_DRIVE = /^[a-z]:$/i;

/**
 * Turn a markdown image source into an absolute path on the workspace's
 * filesystem, or null when it isn't a local file: a URL with a scheme
 * (http, https, data, …) or a UNC share, which on Windows would make the
 * host authenticate against a remote SMB server just to fetch the bytes.
 */
export function resolveLocalImagePath(
	source: string,
	base: LocalImageBase,
): string | null {
	const trimmed = source.trim();
	if (!trimmed) return null;

	// A file: URL or a drive path is already a filesystem path; a bare
	// leading slash is workspace-relative, the way GitHub renders it.
	let path: string | null;
	let filesystemAbsolute = false;
	if (/^file:/i.test(trimmed)) {
		path = fileUrlToPath(trimmed);
		filesystemAbsolute = true;
	} else {
		// markdown-it percent-encodes whatever it doesn't consider URL-safe,
		// backslashes included, so decode before looking at the shape.
		const bare = percentDecode(trimmed.split(/[?#]/, 1)[0] ?? "");
		if (WINDOWS_DRIVE_PATH.test(bare)) {
			path = bare;
			filesystemAbsolute = true;
		} else if (SCHEME_PREFIX.test(bare)) {
			return null;
		} else {
			path = bare;
		}
	}
	if (!path) return null;

	const slashed = path.replace(/\\/g, "/");
	if (slashed.startsWith("//")) return null;
	const directory = base.documentDirectory.replace(/\\/g, "/");
	const root = base.rootPath?.replace(/\\/g, "/");

	let joined: string;
	if (filesystemAbsolute || WINDOWS_DRIVE_ROOT.test(slashed)) {
		joined = slashed;
	} else if (slashed.startsWith("/")) {
		joined = root ? joinPath(root, slashed) : slashed;
	} else {
		if (!directory) return null;
		joined = joinPath(directory, slashed);
	}

	const collapsed = collapseDotSegments(joined);
	return base.documentDirectory.includes("\\")
		? collapsed.replace(/\//g, "\\")
		: collapsed;
}

function fileUrlToPath(url: string): string | null {
	try {
		const parsed = new URL(url);
		// file://server/share is a UNC share in disguise.
		if (parsed.hostname && parsed.hostname !== "localhost") return null;
		const pathname = percentDecode(parsed.pathname);
		return /^\/[a-z]:\//i.test(pathname) ? pathname.slice(1) : pathname;
	} catch {
		return null;
	}
}

function percentDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function joinPath(directory: string, relative: string): string {
	return `${directory.replace(/[\\/]+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

/** Collapse `.` and `..` on a `/`-separated path without popping its root. */
function collapseDotSegments(path: string): string {
	const [first = "", ...rest] = path.split("/");
	const root = first === "" || WINDOWS_DRIVE.test(first) ? first : null;
	const out: string[] = [];
	for (const segment of root === null ? [first, ...rest] : rest) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			out.pop();
			continue;
		}
		out.push(segment);
	}
	return root === null ? out.join("/") : `${root}/${out.join("/")}`;
}
