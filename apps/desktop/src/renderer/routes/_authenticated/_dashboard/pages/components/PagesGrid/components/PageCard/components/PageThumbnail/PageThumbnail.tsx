import { FileText } from "lucide-react";
import { useState } from "react";
import { THUMBNAIL_ASPECT_RATIO } from "../../../../constants";

interface PageThumbnailProps {
	src: string | null;
}

/**
 * Thumbnails are captured server-side after publish and served by the
 * usercontent origin; one that has not been captured yet 404s, and the card
 * shows a placeholder until the next list refetch.
 */
export function PageThumbnail({ src }: PageThumbnailProps) {
	const [failed, setFailed] = useState<{ src: string; at: number } | null>(
		null,
	);
	// A capture that has not happened yet 404s; the failure is remembered per
	// src but expires, so a later list refetch retries instead of showing the
	// placeholder forever under the same thumbnail URL.
	const showImage =
		src !== null &&
		!(failed && failed.src === src && Date.now() - failed.at < 60_000);

	return (
		<div
			className="relative w-full overflow-hidden bg-muted/40"
			style={{ aspectRatio: THUMBNAIL_ASPECT_RATIO }}
		>
			{showImage ? (
				<img
					src={src}
					alt=""
					aria-hidden="true"
					loading="lazy"
					decoding="async"
					onError={() => setFailed({ src, at: Date.now() })}
					className="absolute inset-0 h-full w-full object-cover object-top"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground">
					<FileText className="size-5 opacity-40" />
				</div>
			)}
		</div>
	);
}
