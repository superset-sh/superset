import { useEffect, useState } from "react";
import { getBaseName } from "renderer/lib/pathBasename";
import { getVideoMimeType } from "shared/file-types";
import type { ViewProps } from "../../types";

export function VideoView({ document, filePath }: ViewProps) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);

	useEffect(() => {
		if (document.content.kind !== "bytes") {
			setObjectUrl(null);
			return;
		}
		const mimeType = getVideoMimeType(filePath) ?? "video/mp4";
		const url = URL.createObjectURL(
			new Blob([document.content.value as BlobPart], { type: mimeType }),
		);
		setObjectUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [document.content, filePath]);

	if (!objectUrl) {
		return null;
	}

	return (
		<div className="flex h-full items-center justify-center overflow-auto bg-background p-4">
			<video
				src={objectUrl}
				controls
				preload="metadata"
				className="max-h-full max-w-full rounded-md bg-black"
				aria-label={getBaseName(filePath)}
			>
				<track kind="captions" />
			</video>
		</div>
	);
}
