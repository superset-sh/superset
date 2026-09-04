import type { CodeViewItem, SelectionSide } from "@pierre/diffs";
import type { DiffAnnotationMetadata } from "../../useDiffAnnotations";

export interface OrderedDiffThread {
	threadId: string;
	itemId: string;
	/** Binary placeholders are `file` items — navigated with an item scroll
	 *  since their single re-anchored line carries no side. */
	itemType: "diff" | "file";
	lineNumber: number;
	side?: SelectionSide;
}

/**
 * Review threads flattened in diff order (item order, then line number within
 * an item) so next/prev walks the pane top-to-bottom instead of
 * thread-creation order. Deduped by thread id: the same path can appear in
 * two sections (e.g. staged + unstaged), and both items carry the same
 * path-keyed annotations — without the dedupe every thread would be visited
 * twice per cycle.
 */
export function buildOrderedThreads(
	items: readonly CodeViewItem<DiffAnnotationMetadata>[],
): OrderedDiffThread[] {
	const list: OrderedDiffThread[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const annotations = item.annotations;
		if (!annotations?.length) continue;
		const sorted = [...annotations].sort((a, b) => a.lineNumber - b.lineNumber);
		for (const annotation of sorted) {
			const metadata = annotation.metadata;
			if (metadata?.kind !== "thread") continue;
			if (seen.has(metadata.threadId)) continue;
			seen.add(metadata.threadId);
			list.push({
				threadId: metadata.threadId,
				itemId: item.id,
				itemType: item.type === "file" ? "file" : "diff",
				lineNumber: annotation.lineNumber,
				...("side" in annotation && annotation.side
					? { side: annotation.side }
					: {}),
			});
		}
	}
	return list;
}
