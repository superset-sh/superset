export const PAGE_CONTENT_TYPES = ["text/html"] as const;

export const PAGE_ASSET_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/svg+xml",
] as const;

export type PageAssetContentType = (typeof PAGE_ASSET_CONTENT_TYPES)[number];

export function isPageAssetContentType(
	value: string,
): value is PageAssetContentType {
	return (PAGE_ASSET_CONTENT_TYPES as readonly string[]).includes(value);
}
