import { useEffect, useState } from "react";
import { getBaseName } from "renderer/lib/pathBasename";
import type { ViewProps } from "../../types";

export function PdfView({ document, filePath }: ViewProps) {
	const [source, setSource] = useState<{
		key: string;
		url: string;
	} | null>(null);

	const sourceKey =
		document.content.kind === "bytes"
			? `${filePath}\0${document.content.revision}`
			: null;

	useEffect(() => {
		if (document.content.kind !== "bytes") {
			setSource(null);
			return;
		}
		const url = URL.createObjectURL(
			new Blob([document.content.value as BlobPart], {
				type: "application/pdf",
			}),
		);
		setSource({ key: `${filePath}\0${document.content.revision}`, url });
		return () => URL.revokeObjectURL(url);
	}, [document.content, filePath]);

	if (!source || source.key !== sourceKey) {
		return null;
	}

	return (
		<iframe
			src={source.url}
			title={getBaseName(filePath)}
			className="h-full w-full border-0 bg-background"
		/>
	);
}
