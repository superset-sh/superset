import { useCallback, useEffect, useRef } from "react";
import { track } from "@/lib/posthog";

export type ComposerName = "home" | "workspace";

/**
 * The restored/discarded pair for one composer's draft.
 *
 * Restoring is a mount fact: the composer pins the saved text once and owns it
 * from then on. Discarding has no button — `clearDraft` only ever runs after a
 * successful send — so the only way a restored draft goes away without being
 * sent is the user emptying the field, which is what the returned observer
 * watches for. Call it beside `setText`.
 */
export function useComposerDraftTracking(
	composer: ComposerName,
	initialDraft: string,
) {
	const restored = initialDraft.length > 0;
	const alreadyDiscarded = useRef(false);

	useEffect(() => {
		if (!restored) return;
		track("composer_draft_restored", {
			composer,
			message_length: initialDraft.length,
		});
	}, [restored, composer, initialDraft.length]);

	return useCallback(
		(text: string) => {
			if (!restored || alreadyDiscarded.current || text.length > 0) return;
			alreadyDiscarded.current = true;
			track("composer_draft_discarded", { composer });
		},
		[restored, composer],
	);
}
