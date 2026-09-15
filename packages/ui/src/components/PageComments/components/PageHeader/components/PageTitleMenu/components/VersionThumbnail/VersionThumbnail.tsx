import { FileText } from "lucide-react";
import { useState } from "react";

interface VersionThumbnailProps {
	src: string | null | undefined;
}

/**
 * Version thumbnails are emitted without checking R2, so one that has not been
 * captured yet 404s and falls back here rather than costing every caller a
 * listing to find out.
 */
export function VersionThumbnail({ src }: VersionThumbnailProps) {
	const [failed, setFailed] = useState(false);

	if (!src || failed) {
		return (
			<span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-sm border border-border bg-muted">
				<FileText className="size-4 text-muted-foreground" />
			</span>
		);
	}

	return (
		<img
			src={src}
			alt=""
			aria-hidden="true"
			loading="lazy"
			decoding="async"
			onError={() => setFailed(true)}
			className="h-10 w-14 shrink-0 rounded-sm border border-border object-cover object-top"
		/>
	);
}
