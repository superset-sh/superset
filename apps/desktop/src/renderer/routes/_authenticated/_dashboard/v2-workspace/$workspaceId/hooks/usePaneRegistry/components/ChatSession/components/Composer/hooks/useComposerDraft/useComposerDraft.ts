import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

const unsavedDrafts = new Map<string, string>();
const recoveredAfterRead = new Map<string, string[]>();

function persistDraft(draftKey: string, text: string): boolean {
	try {
		if (text === "") window.localStorage.removeItem(draftKey);
		else window.localStorage.setItem(draftKey, text);
		return true;
	} catch (error) {
		console.warn("[chat] could not save the composer draft", error);
		return false;
	}
}

function readDraft(draftKey: string): string | undefined {
	const unsaved = unsavedDrafts.get(draftKey);
	if (unsaved !== undefined) return unsaved;
	try {
		return window.localStorage.getItem(draftKey) ?? undefined;
	} catch {
		return undefined;
	}
}

export function prependToDraft(draftKey: string, text: string) {
	const current = readDraft(draftKey);
	const merged = current ? `${text}\n\n${current}` : text;
	unsavedDrafts.set(draftKey, merged);
	persistDraft(draftKey, merged);
	recoveredAfterRead.set(draftKey, [
		...(recoveredAfterRead.get(draftKey) ?? []),
		text,
	]);
}

export function takeRecoveredDraftText(draftKey: string): string | null {
	const recovered = recoveredAfterRead.get(draftKey);
	recoveredAfterRead.delete(draftKey);
	return recovered?.length ? recovered.join("\n\n") : null;
}

export function useComposerDraft(draftKey: string) {
	const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingDraftKey = useRef<string | null>(null);
	const flushDraft = useCallback(() => {
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		const key = pendingDraftKey.current;
		pendingDraftKey.current = null;
		if (key === null) return;
		const text = unsavedDrafts.get(key);
		if (text !== undefined && persistDraft(key, text)) {
			unsavedDrafts.delete(key);
		}
	}, []);
	const onChange = useCallback(
		(text: string) => {
			if (draftTimer.current) clearTimeout(draftTimer.current);
			unsavedDrafts.set(draftKey, text);
			pendingDraftKey.current = draftKey;
			draftTimer.current = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
		},
		[draftKey, flushDraft],
	);
	useEffect(() => flushDraft, [flushDraft]);

	const [seed, setSeed] = useState(() => {
		recoveredAfterRead.delete(draftKey);
		return { draftKey, text: readDraft(draftKey) };
	});

	const clearDraft = useCallback(() => {
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		pendingDraftKey.current = null;
		unsavedDrafts.delete(draftKey);
		persistDraft(draftKey, "");
		setSeed({ draftKey, text: undefined });
	}, [draftKey]);

	const storedDraft =
		seed.draftKey === draftKey ? seed.text : readDraft(draftKey);

	return { storedDraft, onChange, clearDraft };
}
