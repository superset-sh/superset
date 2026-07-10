import { LuImageOff } from "react-icons/lu";

/**
 * Check if an image source is safe to load.
 *
 * ALLOWED:
 * - data: URLs (embedded base64 images)
 * - https:// URLs (GitHub user-attachments, avatars, etc.)
 *
 * BLOCKED (everything else):
 * - http:// (cleartext / mixed-content)
 * - file:// URLs (arbitrary local file access)
 * - Absolute paths /... or \... (become file:// in Electron)
 * - Relative paths with .. (can escape repo boundary)
 * - UNC paths //server/share (Windows NTLM credential leak)
 * - Empty or malformed sources
 *
 * Trade-off: https sources can phone home (tracking pixels). Acceptable
 * here because the markdown comes from trusted sources (GitHub PR/issue
 * bodies, user-authored task descriptions) where image embedding is part
 * of the expected UX.
 */
function isSafeImageSrc(src: string | undefined): boolean {
	if (!src) return false;
	const trimmed = src.trim();
	if (trimmed.length === 0) return false;
	const lower = trimmed.toLowerCase();

	if (lower.startsWith("data:")) return true;
	if (lower.startsWith("https://")) return true;
	return false;
}

interface SafeImageProps {
	src?: string;
	alt?: string;
	className?: string;
}

/**
 * Safe image component for markdown content.
 *
 * Renders data: and http(s):// images. file://, absolute paths, UNC paths,
 * and traversal sources are blocked to prevent local-filesystem access from
 * malicious markdown content.
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
