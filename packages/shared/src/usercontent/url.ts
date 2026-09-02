/**
 * One origin per page: `<pageId>.<pages host>`. A page id is a UUID, which
 * is already a valid DNS label (lowercase hex and hyphens, 36 characters).
 */
export function pageOrigin(baseUrl: string, pageId: string): string {
	const base = new URL(baseUrl);
	return `${base.protocol}//${pageId}.${base.host}`;
}

export const THUMBNAIL_FILENAME = "thumbnail.jpg";
export const TICKET_QUERY_PARAM = "ticket";
export const TICKET_PATH_PREFIX = "~";

/**
 * `/` serves the shared version (or latest); `/versions/<n>/` pins one. A
 * ticket rides as its own path segment — `/versions/3/~<ticket>/` — so every
 * relative reference inside the document resolves under that prefix and
 * carries the ticket by construction, with no cookie. Thumbnails are
 * app-referenced (the app builds the tag), so their ticket stays in the
 * query.
 */
export function pageViewUrl({
	baseUrl,
	pageId,
	version = null,
	ticket,
}: {
	baseUrl: string;
	pageId: string;
	version?: number | null;
	ticket?: string;
}): string {
	const segments = version === null ? [] : ["versions", String(version)];
	if (ticket) segments.push(`${TICKET_PATH_PREFIX}${ticket}`);
	const path = segments.length === 0 ? "/" : `/${segments.join("/")}/`;
	return new URL(path, pageOrigin(baseUrl, pageId)).toString();
}

export function pageThumbnailUrl({
	baseUrl,
	pageId,
	version,
	ticket,
}: {
	baseUrl: string;
	pageId: string;
	version: number;
	ticket?: string;
}): string {
	const url = new URL(
		`/versions/${version}/${THUMBNAIL_FILENAME}`,
		pageOrigin(baseUrl, pageId),
	);
	if (ticket) url.searchParams.set(TICKET_QUERY_PARAM, ticket);
	return url.toString();
}

const PAGE_ID_LABEL =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The page id a request host names, or null for the apex or a bad label. */
export function pageIdFromHost(host: string, baseHost: string): string | null {
	const suffix = `.${baseHost}`;
	if (!host.endsWith(suffix)) return null;
	const label = host.slice(0, -suffix.length);
	return PAGE_ID_LABEL.test(label) ? label : null;
}

/**
 * `/files/<fileId>` on the media host — app-rendered attachments (issues,
 * chat, comments). The optional filename suffix is cosmetic: it names the
 * download, the Worker resolves only the id.
 */
export function fileUrl({
	baseUrl,
	fileId,
	filename,
	ticket,
}: {
	baseUrl: string;
	fileId: string;
	filename?: string;
	ticket?: string;
}): string {
	const path = filename
		? `/files/${fileId}/${encodeURIComponent(filename)}`
		: `/files/${fileId}`;
	const url = new URL(path, baseUrl);
	if (ticket) url.searchParams.set(TICKET_QUERY_PARAM, ticket);
	return url.toString();
}
