import type { ComposerPastedItem } from "@superset/composer";
import { useCallback } from "react";
import { useComposerDraft } from "@/screens/(authenticated)/hooks/useComposerDraft";

/**
 * Adds pasted files and images to the attachment tray.
 *
 * The native side has already written them to disk, so they arrive in the same
 * shape the pickers produce and need no conversion — the mime type comes off
 * the extension, which is all the tray uses it for.
 *
 * Takes the surface's draft key so a paste lands in that surface's tray and no
 * one else's.
 */
export function usePasteAttachments(draftKey: string) {
	const attachments = useComposerDraft(draftKey);
	return useCallback(
		(items: ComposerPastedItem[]) => {
			if (items.length === 0) return;
			attachments.add(
				items.map((item) => ({
					name: item.name,
					type: item.kind,
					uri: item.uri,
					mediaType: mediaTypeFor(item.name, item.kind),
				})),
				"paste",
			);
		},
		[attachments],
	);
}

const IMAGE_TYPES: Record<string, string> = {
	gif: "image/gif",
	heic: "image/heic",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

function mediaTypeFor(name: string, kind: "image" | "file") {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	if (kind === "image") return IMAGE_TYPES[ext] ?? "image/png";
	return undefined;
}
