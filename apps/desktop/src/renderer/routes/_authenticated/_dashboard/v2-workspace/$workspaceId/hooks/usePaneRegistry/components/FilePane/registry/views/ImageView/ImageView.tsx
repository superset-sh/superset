import { useEffect, useState } from "react";
import { getImageMimeType } from "shared/file-types";
import type { ViewProps } from "../../types";

export function ImageView({ document, filePath }: ViewProps) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);

	useEffect(() => {
		if (document.content.kind !== "bytes") {
			setObjectUrl(null);
			return;
		}
		const mimeType = getImageMimeType(filePath) ?? "image/png";
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
			<div
				className="inline-block max-h-full max-w-full"
				style={{
					backgroundImage:
						"conic-gradient(color-mix(in srgb, var(--color-foreground) 10%, transparent) 25%, transparent 0 50%, color-mix(in srgb, var(--color-foreground) 10%, transparent) 0 75%, transparent 0)",
					backgroundSize: "16px 16px",
				}}
			>
				<img
					src={objectUrl}
					alt={filePath.split("/").pop() ?? ""}
					className="block max-h-full max-w-full object-contain"
					draggable={false}
				/>
			</div>
		</div>
	);
}
