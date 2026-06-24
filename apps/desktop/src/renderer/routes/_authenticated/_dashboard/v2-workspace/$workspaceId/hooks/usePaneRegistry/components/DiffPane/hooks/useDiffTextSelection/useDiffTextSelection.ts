import type { CodeViewOptions, SelectedLineRange } from "@pierre/diffs";
import { useCallback, useEffect, useRef } from "react";
import {
	type DiffSelectionRoot,
	resolveDiffSelectionLines,
} from "../../utils/resolveDiffSelectionLines";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

type OnPostRender = NonNullable<
	CodeViewOptions<DiffAnnotationMetadata>["onPostRender"]
>;

// ponytail: <diffs-container> is a shadow-DOM web component from @pierre/diffs
// ≥1.2.2 with no text-selection API. We read its `shadowRoot.getSelection()`
// (Chromium-only) and resolve lines from the rendered DOM in
// resolveDiffSelectionLines. Upstream request for a real API is
// github.com/pierredotco/diffs#248 (closed/completed).
interface DiffsContainerElement extends HTMLElement {
	shadowRoot: (ShadowRoot & DiffSelectionRoot) | null;
}

interface UseDiffTextSelectionArgs {
	/** Opens the same composer the gutter line-selection uses, given a resolved
	 *  item + range — so highlighted text and gutter selection share one
	 *  pipeline. */
	openForItem: (itemId: string, range: SelectedLineRange) => void;
}

interface UseDiffTextSelectionResult {
	onPostRender: OnPostRender;
}

const SELECTION_SETTLE_MS = 50;

/**
 * Lets a user open the agent composer by highlighting code text inside a
 * @pierre/diffs diff (not just via the gutter line-selection).
 *
 * @pierre/diffs renders each file into its own `<diffs-container>` shadow root
 * and exposes no selection hook, so we attach a `pointerup` listener to each
 * file's rendered host node (delivered by CodeView's `onPostRender`, which also
 * hands us `context.item.id` — a non-order-dependent itemId, so no path/index
 * correlation is needed). On pointer-up we resolve the shadow-root selection to
 * a line range and open the same composer the gutter selection uses.
 */
export function useDiffTextSelection({
	openForItem,
}: UseDiffTextSelectionArgs): UseDiffTextSelectionResult {
	// Latest callback without re-binding listeners every render.
	const openForItemRef = useRef(openForItem);
	openForItemRef.current = openForItem;

	// node -> cleanup, so we bind once per file host and tear every listener
	// down on unmount. onPostRender can fire repeatedly for the same node.
	const cleanupByNode = useRef(new Map<HTMLElement, () => void>());

	useEffect(() => {
		const registry = cleanupByNode.current;
		return () => {
			for (const cleanup of registry.values()) cleanup();
			registry.clear();
		};
	}, []);

	const onPostRender = useCallback<OnPostRender>((node, _instance, context) => {
		if (context.type !== "diff") return;
		const host = node as DiffsContainerElement;
		const registry = cleanupByNode.current;
		if (registry.has(host)) return;

		const itemId = context.item.id;
		let settleTimer: ReturnType<typeof setTimeout> | undefined;

		// Wait a tick after pointer-up so the browser commits the final selection
		// before we read it (avoids resolving a mid-drag/cleared selection).
		const handlePointerUp = () => {
			if (settleTimer != null) clearTimeout(settleTimer);
			settleTimer = setTimeout(() => {
				const range = resolveDiffSelectionLines(host.shadowRoot);
				if (!range) return; // collapsed / non-line selection: leave gutter alone
				openForItemRef.current(itemId, range);
			}, SELECTION_SETTLE_MS);
		};

		host.addEventListener("pointerup", handlePointerUp);
		registry.set(host, () => {
			if (settleTimer != null) clearTimeout(settleTimer);
			host.removeEventListener("pointerup", handlePointerUp);
		});
	}, []);

	return { onPostRender };
}
