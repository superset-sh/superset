import type { AttachmentUpload } from "@/screens/(authenticated)/stores/composerDraftsStore";
import { useComposerDraftsStore } from "@/screens/(authenticated)/stores/composerDraftsStore";

/**
 * Resolves once every named attachment has either an id or an error.
 *
 * An attachment the draft no longer holds counts as settled: it was removed
 * mid-send, and waiting on an entry nothing will ever write hangs the
 * composer.
 *
 * Reads the store once before subscribing rather than trusting a snapshot
 * taken earlier — a retry started moments ago has had its error cleared and
 * is no longer settled, and missing that is what made a retry resolve
 * instantly against the failure it was retrying.
 */
export function waitForSettledUploads(
	draftKey: string,
	ids: string[],
): Promise<Record<string, AttachmentUpload>> {
	const read = () =>
		useComposerDraftsStore.getState().draftsByKey[draftKey]?.uploads ?? {};
	const settled = (uploads: Record<string, AttachmentUpload>) =>
		ids.every((id) => {
			const entry = uploads[id];
			return !entry || entry.fileId !== undefined || entry.error !== undefined;
		});

	return new Promise((resolve) => {
		const current = read();
		if (settled(current)) return resolve(current);
		const unsubscribe = useComposerDraftsStore.subscribe((state) => {
			const next = state.draftsByKey[draftKey]?.uploads ?? {};
			if (!settled(next)) return;
			unsubscribe();
			resolve(next);
		});
	});
}
