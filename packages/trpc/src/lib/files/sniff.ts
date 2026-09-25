/**
 * Establishes what an uploaded object really is from its first bytes — the
 * serve-time policy keys on this, never on what the client declared. The
 * bias is safety over precision: anything that smells like a scriptable
 * document is named as one so the policy makes it download, and an unknown
 * binary keeps the declared type only when that type could not script.
 */

const SCRIPTABLE_DECLARED = new Set([
	"text/html",
	"application/xhtml+xml",
	"text/xml",
	"application/xml",
	"image/svg+xml",
]);

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
	if (offset + text.length > bytes.length) return false;
	for (let i = 0; i < text.length; i += 1) {
		if (bytes[offset + i] !== text.charCodeAt(i)) return false;
	}
	return true;
}

function startsWith(bytes: Uint8Array, ...signature: number[]): boolean {
	return signature.every((byte, i) => bytes[i] === byte);
}

function fromFtyp(bytes: Uint8Array): string | null {
	if (!ascii(bytes, 4, "ftyp")) return null;
	const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
	if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
	if (brand.startsWith("hei") || brand.startsWith("mif")) return "image/heic";
	if (brand.startsWith("qt")) return "video/quicktime";
	return "video/mp4";
}

function textType(bytes: Uint8Array, declared: string): string {
	// Portable UTF-8 validity check: decode leniently and treat replacement
	// characters as binary, allowing exactly one at the very end where the
	// sample window may have cut a multi-byte sequence.
	const decoded = new TextDecoder().decode(bytes);
	const text = decoded.endsWith("\ufffd") ? decoded.slice(0, -1) : decoded;
	if (text.includes("\ufffd")) return "application/octet-stream";
	// Text with bare control characters is binary that happened to decode.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
	if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
		return "application/octet-stream";
	}
	const head = text
		.replace(/^\ufeff/, "")
		.trimStart()
		.slice(0, 512)
		.toLowerCase();
	if (
		head.startsWith("<!doctype html") ||
		head.startsWith("<html") ||
		head.startsWith("<head") ||
		head.startsWith("<body") ||
		head.startsWith("<script") ||
		head.startsWith("<iframe")
	) {
		return "text/html";
	}
	if (
		head.startsWith("<svg") ||
		(head.startsWith("<?xml") && head.includes("<svg"))
	) {
		return "image/svg+xml";
	}
	if (head.startsWith("<?xml")) return "application/xml";
	if (head.startsWith("{") || head.startsWith("[")) return "application/json";
	const type = (declared.split(";")[0] ?? "").trim().toLowerCase();
	if (type.startsWith("text/") && !SCRIPTABLE_DECLARED.has(type)) return type;
	return "text/plain";
}

export function sniffContentType(bytes: Uint8Array, declared: string): string {
	if (bytes.length === 0) return "application/octet-stream";
	if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
	if (startsWith(bytes, 0xff, 0xd8, 0xff)) return "image/jpeg";
	if (ascii(bytes, 0, "GIF8")) return "image/gif";
	if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
	if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE")) return "audio/wav";
	const ftyp = fromFtyp(bytes);
	if (ftyp) return ftyp;
	if (startsWith(bytes, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
	if (ascii(bytes, 0, "%PDF")) return "application/pdf";
	if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04)) return "application/zip";
	if (startsWith(bytes, 0x1f, 0x8b)) return "application/gzip";
	if (ascii(bytes, 0, "OggS")) return "audio/ogg";
	if (ascii(bytes, 0, "ID3") || startsWith(bytes, 0xff, 0xfb))
		return "audio/mpeg";
	if (ascii(bytes, 0, "wOF2")) return "font/woff2";
	if (ascii(bytes, 0, "wOFF")) return "font/woff";

	const declaredType = (declared.split(";")[0] ?? "").trim().toLowerCase();
	const looksTextual =
		declaredType.startsWith("text/") ||
		declaredType === "application/json" ||
		declaredType === "image/svg+xml" ||
		declaredType === "application/xml" ||
		bytes.slice(0, 64).every((b) => b === 9 || b === 10 || b === 13 || b >= 32);
	if (looksTextual) return textType(bytes, declared);
	if (SCRIPTABLE_DECLARED.has(declaredType)) return "application/octet-stream";
	return declaredType || "application/octet-stream";
}
