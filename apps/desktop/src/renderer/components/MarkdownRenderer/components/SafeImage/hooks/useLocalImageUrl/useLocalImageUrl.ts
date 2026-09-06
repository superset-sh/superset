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
	revision: string | undefined,
): LocalImageState {
	const [loaded, setLoaded] = useState<{ path: string; url: string | null }>();

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision is the retry signal — a moved disk revision re-reads the image
	useEffect(() => {
		if (!absolutePath || !readFile) {
			// Drop the blob once the source stops being a local file, rather
			// than holding it until unmount.
			setLoaded(undefined);
			return;
		}
		let cancelled = false;
		readFile(absolutePath).then(
			(bytes) => {
				if (cancelled) return;
				const url = URL.createObjectURL(
					new Blob([bytes as BlobPart], {
						type: getImageMimeType(absolutePath) ?? "image/png",
					}),
				);
				setLoaded({ path: absolutePath, url });
			},
			() => {
				if (!cancelled) setLoaded({ path: absolutePath, url: null });
			},
		);
		return () => {
			cancelled = true;
		};
	}, [absolutePath, readFile, revision]);

	// The previous URL stays valid until the next read lands, so a re-read
	// swaps images without a broken frame in between.
	useEffect(() => {
		const url = loaded?.url;
		if (!url) return;
		return () => URL.revokeObjectURL(url);
	}, [loaded]);

	if (!absolutePath || loaded?.path !== absolutePath) {
		return { status: "loading" };
	}
	return loaded.url
		? { status: "ready", url: loaded.url }
		: { status: "error" };
}
