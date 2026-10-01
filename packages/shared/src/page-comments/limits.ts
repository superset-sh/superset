/**
 * What a comment may carry. Shared because both ends enforce it: the
 * composer refuses locally what the server would refuse anyway, and the
 * server is the authority.
 */
export const MAX_COMMENT_IMAGES = 4;

export const MAX_COMMENT_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Types a comment image may be once the server has sniffed the bytes —
 * everything Chromium renders in an `<img>`. Notably absent: SVG, which is a
 * document with script, and HEIC, which browsers cannot decode.
 */
export const COMMENT_IMAGE_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
] as const;
