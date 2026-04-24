/**
 * File-attachment renderer. Legacy sends screenshots dropped into the
 * composer as {type: "file", mediaType: "image/png", filename: <abs path>},
 * so we detect image MIME types and render an <img> preview rather than
 * the raw filesystem path. Non-image files show basename + mime.
 */

import type { FilePart } from "@superset/chat/shared";
import { basename, isImageMime } from "./FilePart.logic";
import type { PartProps } from "./parts";

export function FilePartView({ part }: PartProps<FilePart>) {
	const isImage = isImageMime(part.mime);
	const name = basename(part.path) || part.mime || "file";

	if (isImage && part.url) {
		return (
			<img
				src={part.url}
				className="border-border-weak my-1 max-h-48 rounded-md border object-contain"
				alt={name}
			/>
		);
	}

	return (
		<div className="border-border-weak my-1 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
			<span className="font-mono">{name}</span>
			{part.mime && (
				<span className="text-muted-foreground">{part.mime}</span>
			)}
		</div>
	);
}
