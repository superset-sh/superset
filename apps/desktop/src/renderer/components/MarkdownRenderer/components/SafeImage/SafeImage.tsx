import { LuImageOff } from "react-icons/lu";

/**
 * Check if a URL is external (http:// or https://).
 * External images are blocked by default to prevent:
 * - Tracking pixels leaking user IP/activity
 * - Automatic downloads of large/malicious files
 * - Internal network exposure
 */
function isExternalUrl(src: string | undefined): boolean {
	if (!src) return false;
	const lower = src.toLowerCase().trim();
	return lower.startsWith("http://") || lower.startsWith("https://");
}

interface SafeImageProps {
	src?: string;
	alt?: string;
	className?: string;
}

/**
 * Safe image component that blocks external URLs by default.
 *
 * Allowed:
 * - Relative paths (./image.png, ../assets/logo.svg)
 * - Data URLs (data:image/png;base64,...)
 * - File URLs (file://...)
 *
 * Blocked:
 * - HTTP/HTTPS URLs (privacy risk from untrusted repos)
 */
export function SafeImage({ src, alt, className }: SafeImageProps) {
	if (isExternalUrl(src)) {
		return (
			<div
				className={`inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm ${className ?? ""}`}
				title={`External image blocked: ${src}`}
			>
				<LuImageOff className="w-4 h-4 flex-shrink-0" />
				<span className="truncate max-w-[300px]">External image blocked</span>
			</div>
		);
	}

	// Safe to render - relative path or data URL
	return (
		<img
			src={src}
			alt={alt}
			className={className ?? "max-w-full h-auto rounded-md my-4"}
		/>
	);
}
