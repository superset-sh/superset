import { useMemo } from "react";
import { getImageMimeType } from "shared/file-types";

interface ImageRendererProps {
	content: Uint8Array;
	filePath: string;
}

export function ImageRenderer({ content, filePath }: ImageRendererProps) {
	const dataUrl = useMemo(() => {
		const mimeType = getImageMimeType(filePath) ?? "image/png";
		const base64 = btoa(
			Array.from(content)
				.map((b) => String.fromCharCode(b))
				.join(""),
		);
		return `data:${mimeType};base64,${base64}`;
	}, [content, filePath]);

	return (
		<div className="flex h-full items-center justify-center overflow-auto bg-background p-4">
			<img
				src={dataUrl}
				alt={filePath.split("/").pop() ?? ""}
				className="max-h-full max-w-full object-contain"
				draggable={false}
			/>
		</div>
	);
}
