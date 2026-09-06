import { useEffect, useState } from "react";
import type { MarkdownResources } from "renderer/components/MarkdownRenderer/providers/MarkdownResourceProvider";
import { getImageMimeType } from "shared/file-types";

type LocalImageState =
	| { status: "loading" }
	| { status: "ready"; url: string }
	| { status: "error" };

/** Read a workspace image into an object URL an <img> can show. */
export function useLocalImageUrl(
	absolutePath: string | null,
	readFile: MarkdownResources["readFile"] | undefined,
): LocalImageState {
	const [loaded, setLoaded] = useState<{ path: string; url: string | null }>();

	useEffect(() => {
		if (!absolutePath || !readFile) return;
		let cancelled = false;
		let objectUrl: string | null = null;
		readFile(absolutePath).then(
			(bytes) => {
				if (cancelled) return;
				objectUrl = URL.createObjectURL(
					new Blob([bytes as BlobPart], {
						type: getImageMimeType(absolutePath) ?? "image/png",
					}),
				);
				setLoaded({ path: absolutePath, url: objectUrl });
			},
			() => {
				if (!cancelled) setLoaded({ path: absolutePath, url: null });
			},
		);
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [absolutePath, readFile]);

	if (!absolutePath || loaded?.path !== absolutePath) {
		return { status: "loading" };
	}
	return loaded.url
		? { status: "ready", url: loaded.url }
		: { status: "error" };
}
