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

// ponytail: <diffs-container> is a @pierre/diffs shadow-DOM component with no
// selection API, so we read its shadowRoot.getSelection() (Chromium-only).
// Upstream: github.com/pierredotco/diffs#248.
interface DiffsContainerElement extends HTMLElement {
	shadowRoot: (ShadowRoot & DiffSelectionRoot) | null;
}

interface UseDiffTextSelectionArgs {
	/** Opens the same composer the gutter line-selection uses. */
	openForItem: (itemId: string, range: SelectedLineRange) => void;
}

interface UseDiffTextSelectionResult {
	onPostRender: OnPostRender;
}

const SELECTION_SETTLE_MS = 50;

/** Open the agent composer by highlighting diff text: bind a pointerup listener
 *  per file host (from onPostRender) and resolve the shadow-root selection. */
export function useDiffTextSelection({
	openForItem,
}: UseDiffTextSelectionArgs): UseDiffTextSelectionResult {
	// Latest callback without re-binding listeners every render.
	const openForItemRef = useRef(openForItem);
	openForItemRef.current = openForItem;

	// Bind one listener per host; itemId lives in a mutable entry so a reused
	// host can't dispatch to a stale item.
	const cleanupByNode = useRef(
		new Map<HTMLElement, { itemId: string; cleanup: () => void }>(),
	);

	useEffect(() => {
		const registry = cleanupByNode.current;
		return () => {
			for (const { cleanup } of registry.values()) cleanup();
			registry.clear();
		};
	}, []);

	const onPostRender = useCallback<OnPostRender>((node, _instance, context) => {
		if (context.type !== "diff") return;
		const host = node as DiffsContainerElement;
		const registry = cleanupByNode.current;

		const existing = registry.get(host);
		if (existing) {
			// Same host re-rendered: refresh the itemId, keep the bound listener.
			existing.itemId = context.item.id;
			return;
		}

		const entry = { itemId: context.item.id, cleanup: () => {} };
		let settleTimer: ReturnType<typeof setTimeout> | undefined;

		// Wait a tick so the browser commits the final selection before we read it.
		const handlePointerUp = () => {
			if (settleTimer != null) clearTimeout(settleTimer);
			settleTimer = setTimeout(() => {
				if (!host.isConnected) return;
				const range = resolveDiffSelectionLines(host.shadowRoot);
				if (!range) return; // collapsed / non-line selection
				openForItemRef.current(entry.itemId, range);
			}, SELECTION_SETTLE_MS);
		};

		host.addEventListener("pointerup", handlePointerUp);
		entry.cleanup = () => {
			if (settleTimer != null) clearTimeout(settleTimer);
			host.removeEventListener("pointerup", handlePointerUp);
		};
		registry.set(host, entry);
	}, []);

	return { onPostRender };
}
