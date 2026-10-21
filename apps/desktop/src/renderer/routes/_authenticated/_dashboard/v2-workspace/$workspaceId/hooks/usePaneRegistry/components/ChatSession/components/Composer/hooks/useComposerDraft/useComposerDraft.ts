import type {
	ComposerDraft,
	ComposerDraftSegment,
} from "@superset/chat-ui/PromptInput";
import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

const EMPTY_DRAFT: ComposerDraft = { segments: [], attachments: [] };

// Attachments are files, so they live here only; storage keeps the segments.
const unsavedDrafts = new Map<string, ComposerDraft>();
const recoveredAfterRead = new Map<string, ComposerDraft[]>();

function isEmpty(draft: ComposerDraft): boolean {
	return draft.segments.length === 0 && draft.attachments.length === 0;
}

function persistDraft(draftKey: string, draft: ComposerDraft): boolean {
	try {
		if (draft.segments.length === 0) window.localStorage.removeItem(draftKey);
		else window.localStorage.setItem(draftKey, JSON.stringify(draft.segments));
		return true;
	} catch (error) {
		console.warn("[chat] could not save the composer draft", error);
		return false;
	}
}

// Drafts saved before segments were plain text.
function parseStoredDraft(stored: string): ComposerDraftSegment[] {
	try {
		const parsed: unknown = JSON.parse(stored);
		if (Array.isArray(parsed)) return parsed as ComposerDraftSegment[];
	} catch {
		// Not JSON: a plain-text draft.
	}
	return stored ? [{ type: "text", text: stored }] : [];
}

function readDraft(draftKey: string): ComposerDraft | undefined {
	const unsaved = unsavedDrafts.get(draftKey);
	if (unsaved !== undefined) return unsaved;
	try {
		const stored = window.localStorage.getItem(draftKey);
		if (stored === null) return undefined;
		return { segments: parseStoredDraft(stored), attachments: [] };
	} catch {
		return undefined;
	}
}

export function joinDrafts(drafts: readonly ComposerDraft[]): ComposerDraft {
	const segments: ComposerDraftSegment[] = [];
	for (const draft of drafts) {
		if (draft.segments.length === 0) continue;
		if (segments.length > 0) segments.push({ type: "text", text: "\n\n" });
		segments.push(...draft.segments);
	}
	return {
		segments,
		attachments: drafts.flatMap((draft) => draft.attachments),
	};
}

export function prependToDraft(
	draftKey: string,
	drafts: readonly ComposerDraft[],
) {
	const merged = joinDrafts([...drafts, readDraft(draftKey) ?? EMPTY_DRAFT]);
	unsavedDrafts.set(draftKey, merged);
	persistDraft(draftKey, merged);
	recoveredAfterRead.set(draftKey, [
		...(recoveredAfterRead.get(draftKey) ?? []),
		...drafts,
	]);
}

export function takeRecoveredDraft(draftKey: string): ComposerDraft | null {
	const recovered = recoveredAfterRead.get(draftKey);
	recoveredAfterRead.delete(draftKey);
	if (!recovered?.length) return null;
	const joined = joinDrafts(recovered);
	return isEmpty(joined) ? null : joined;
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
		const draft = unsavedDrafts.get(key);
		if (
			draft !== undefined &&
			persistDraft(key, draft) &&
			draft.attachments.length === 0
		) {
			unsavedDrafts.delete(key);
		}
	}, []);
	const onDraftChange = useCallback(
		(draft: ComposerDraft) => {
			if (draftTimer.current) clearTimeout(draftTimer.current);
			unsavedDrafts.set(draftKey, draft);
			pendingDraftKey.current = draftKey;
			draftTimer.current = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
		},
		[draftKey, flushDraft],
	);
	useEffect(() => flushDraft, [flushDraft]);

	const [seed, setSeed] = useState(() => {
		recoveredAfterRead.delete(draftKey);
		return { draftKey, draft: readDraft(draftKey) };
	});

	const clearDraft = useCallback(() => {
		if (draftTimer.current) clearTimeout(draftTimer.current);
		draftTimer.current = null;
		pendingDraftKey.current = null;
		unsavedDrafts.delete(draftKey);
		persistDraft(draftKey, EMPTY_DRAFT);
		setSeed({ draftKey, draft: undefined });
	}, [draftKey]);

	const storedDraft =
		seed.draftKey === draftKey ? seed.draft : readDraft(draftKey);

	return { storedDraft, onDraftChange, clearDraft };
}
