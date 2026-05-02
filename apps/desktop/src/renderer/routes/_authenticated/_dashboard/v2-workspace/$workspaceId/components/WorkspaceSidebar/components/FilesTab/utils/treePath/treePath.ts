import type {
	FileTreeDirectoryHandle,
	FileTreeItemHandle,
} from "@pierre/trees";

export function toPosix(p: string): string {
	return p.replace(/\\/g, "/");
}

export function stripTrailingSlash(p: string): string {
	return p.endsWith("/") ? p.slice(0, -1) : p;
}

export function toRel(rootPath: string, abs: string): string {
	const a = toPosix(abs);
	const r = toPosix(rootPath);
	if (a === r) return "";
	if (a.startsWith(`${r}/`)) return a.slice(r.length + 1);
	return a;
}

export function toAbs(rootPath: string, rel: string): string {
	const trimmed = stripTrailingSlash(rel);
	return trimmed ? `${rootPath}/${trimmed}` : rootPath;
}

export function parentRel(rel: string): string {
	const trimmed = stripTrailingSlash(rel);
	const i = trimmed.lastIndexOf("/");
	return i < 0 ? "" : trimmed.slice(0, i);
}

export function basename(rel: string): string {
	const trimmed = stripTrailingSlash(rel);
	const i = trimmed.lastIndexOf("/");
	return i < 0 ? trimmed : trimmed.slice(i + 1);
}

// Pierre's `isDirectory()` is typed as `() => true | false` (literal returns
// per branch) but isn't a TS predicate, so the union doesn't narrow. This
// helper turns it into one.
export function asDirectoryHandle(
	handle: FileTreeItemHandle | null,
): FileTreeDirectoryHandle | null {
	return handle?.isDirectory() ? (handle as FileTreeDirectoryHandle) : null;
}
