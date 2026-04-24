/**
 * Pure helpers for FilePart rendering so the decision is testable in
 * Node without mounting React.
 */

export function isImageMime(mime: string): boolean {
	return mime.startsWith("image/");
}

export function basename(path: string): string {
	if (!path) return "";
	const trimmed = path.replace(/\\/g, "/");
	const slash = trimmed.lastIndexOf("/");
	return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}
