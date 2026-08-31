/**
 * Object keys in the private bucket. A page's keys mirror the URLs the
 * usercontent Worker serves them at: what `/versions/3/` returns is
 * `pages/<pageId>/versions/3/index.html`, so a key reads as its URL and a
 * page is one prefix to list, copy or delete.
 */
export function pageManifestKey(pageId: string): string {
	return `pages/${pageId}/manifest.json`;
}

export function pageVersionKey(pageId: string, version: number): string {
	return `pages/${pageId}/versions/${version}/index.html`;
}

export function pageThumbnailKey(pageId: string, version: number): string {
	return `pages/${pageId}/versions/${version}/thumbnail.jpg`;
}

/** A file is a folder: `original` now, derived siblings (a poster) later. */
export function fileOriginalKey(fileId: string): string {
	return `files/${fileId}/original`;
}
