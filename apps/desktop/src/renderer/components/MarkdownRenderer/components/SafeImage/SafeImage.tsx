import { LuImageOff } from "react-icons/lu";

/**
 * Check if an image source is safe to load.
 *
 * Uses strict ALLOWLIST approach - only data: URLs are safe.
 *
 * ALLOWED:
 * - data: URLs (embedded base64 images)
 *
 * BLOCKED (everything else):
 * - http://, https:// (tracking pixels, privacy leak)
 * - file:// URLs (arbitrary local file access)
 * - Absolute paths /... or \... (become file:// in Electron)
 * - Relative paths with .. (can escape repo boundary)
 * - UNC paths //server/share (Windows NTLM credential leak)
 * - Empty or malformed sources
 *
 * Security context: In Electron production, renderer loads via file://
 * protocol. Any non-data: image src could access local filesystem or
 * trigger network requests to attacker-controlled servers.
 */
function isSafeImageSrc(src: string | undefined): boolean {
	if (!src) return false;
	const trimmed = src.trim();
	if (trimmed.length === 0) return false;

	// Only allow data: URLs (embedded images)
	// These are self-contained and can't access external resources
	return trimmed.toLowerCase().startsWith("data:");
}

interface SafeImageProps {
	src?: string;
	alt?: string;
	className?: string;
}

/**
 * Safe image component for untrusted markdown content.
 *
 * Only renders embedded data: URLs. All other sources are blocked
 * to prevent local file access,  network requests, and path traversal
 * attacks from malicious repository content.
 *
 * Future: Could add opt-in support for repo-relative images via a
 * secure loader that validates paths through secureFs and serves
 * as blob: URLs.
 */
export function SafeImage({ src, alt, className }: SafeImageProps) {
	if (!isSafeImageSrc(src)) {
		return (
			<div
				className={`inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm ${className ?? ""}`}
				title={`Image blocked: ${src ?? "(empty)"}`}
			>
				<LuImageOff className="w-4 h-4 flex-shrink-0" />
				<span className="truncate max-w-[300px]">Image blocked</span>
			</div>
		);
	}

	// Safe to render - embedded data: URL
	return (
		<img
			src={src}
			alt={alt}
			className={className ?? "max-w-full h-auto rounded-md my-4"}
		/>
	);
}
