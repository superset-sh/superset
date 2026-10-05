import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

function writeDraft(draftKey: string, text: string) {
	if (text === "") window.localStorage.removeItem(draftKey);
	else window.localStorage.setItem(draftKey, text);
}

export function useComposerDraft(draftKey: string) {
	const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingDraft = useRef<{ draftKey: string; text: string } | null>(null);
	const flushDraft = useCallback(() => {
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		const pending = pendingDraft.current;
		pendingDraft.current = null;
		if (pending) writeDraft(pending.draftKey, pending.text);
	}, []);
	const onChange = useCallback(
		(text: string) => {
			if (draftTimer.current) clearTimeout(draftTimer.current);
			pendingDraft.current = { draftKey, text };
			draftTimer.current = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
		},
		[draftKey, flushDraft],
	);
	useEffect(() => flushDraft, [flushDraft]);

	const [seed, setSeed] = useState(() => ({
		draftKey,
		text: window.localStorage.getItem(draftKey) ?? undefined,
	}));

	const clearDraft = useCallback(() => {
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		pendingDraft.current = null;
		window.localStorage.removeItem(draftKey);
		setSeed({ draftKey, text: undefined });
	}, [draftKey]);

	const storedDraft =
		seed.draftKey === draftKey
			? seed.text
			: (window.localStorage.getItem(draftKey) ?? undefined);

	return { storedDraft, onChange, clearDraft };
}
