import { useCallback, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	ContentState,
	SaveResult,
	SharedFileDocument,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore";

interface UseSkillDocumentParams {
	name: string;
}

/**
 * Loads/saves a bundled skill's SKILL.md through the `plugins` router and
 * exposes it as a SharedFileDocument so the shared FileEditPane can host it.
 * Unlike the workspace fileDocumentStore this is a plain hook, not a
 * module-singleton store — only one skill is ever open at a time here, and
 * there's no concurrent writer to conflict with, so conflict/orphaned/
 * hasExternalChange stay permanently inert.
 */
export function useSkillDocument({ name }: UseSkillDocumentParams) {
	const utils = electronTrpc.useUtils();
	const { data, isLoading, error } =
		electronTrpc.plugins.getSkillContent.useQuery(
			{ name },
			{ enabled: name !== "" },
		);

	// Local edit state is scoped to `name` and reset synchronously (during
	// render, not an effect) whenever it changes — otherwise a leftover draft
	// from the previously previewed skill would briefly show up as the next
	// skill's editable content if it's reopened before an in-flight autosave
	// (see SkillPreviewDialog's close handler) has resolved.
	const [local, setLocal] = useState<{
		name: string;
		draft: string | null;
		saveError: Error | null;
	}>(() => ({ name, draft: null, saveError: null }));
	if (local.name !== name) {
		setLocal({ name, draft: null, saveError: null });
	}
	const draft = local.name === name ? local.draft : null;
	const saveError = local.name === name ? local.saveError : null;

	const savedContent = data?.content ?? null;
	const path = data?.path ?? null;

	const writeMutation = electronTrpc.plugins.writeSkillContent.useMutation();

	const content: ContentState = useMemo(() => {
		if (isLoading) return { kind: "loading" };
		if (error) return { kind: "error", error: new Error(error.message) };
		if (savedContent === null) return { kind: "not-found" };
		return { kind: "text", value: draft ?? savedContent, revision: "" };
	}, [isLoading, error, savedContent, draft]);

	const dirty = draft !== null && draft !== savedContent;

	const setContent = useCallback(
		(next: string) => {
			setLocal({ name, draft: next, saveError: null });
		},
		[name],
	);

	const save = useCallback(async (): Promise<SaveResult> => {
		if (draft === null || draft === savedContent) {
			return { status: "saved", revision: "" };
		}
		const savingDraft = draft;
		try {
			await writeMutation.mutateAsync({ name, content: savingDraft });
			// Awaited, not fire-and-forget: clearing the draft below makes
			// `content` fall back to `savedContent`, so the refetch must land
			// first or the view would flash back to the pre-save text until it
			// does.
			await utils.plugins.getSkillContent.invalidate({ name });
			// Only clear the draft if it still matches what was just sent —
			// typing more during the in-flight save must not discard those
			// newer, still-unsaved edits.
			setLocal((prev) =>
				prev.name === name && prev.draft === savingDraft
					? { ...prev, draft: null, saveError: null }
					: prev,
			);
			return { status: "saved", revision: "" };
		} catch (err) {
			const error =
				err instanceof Error ? err : new Error("Failed to save skill");
			setLocal((prev) =>
				prev.name === name ? { ...prev, saveError: error } : prev,
			);
			return { status: "error", error };
		}
	}, [draft, savedContent, writeMutation, name, utils]);

	const clearSaveError = useCallback(() => {
		setLocal((prev) =>
			prev.name === name ? { ...prev, saveError: null } : prev,
		);
	}, [name]);

	const document: SharedFileDocument = {
		id: `skill:${name}`,
		workspaceId: "skills",
		absolutePath: path ?? name,
		content,
		dirty,
		pendingSave: writeMutation.isPending,
		saveError,
		conflict: null,
		orphaned: false,
		hasExternalChange: false,
		isBinary: false,
		byteSize: null,
		setContent,
		save,
		reload: async () => {
			setLocal({ name, draft: null, saveError: null });
			await utils.plugins.getSkillContent.invalidate({ name });
		},
		loadUnlimited: async () => {},
		resolveConflict: async () => {},
		clearSaveError,
		subscribe: () => () => {},
		getVersion: () => 0,
	};

	return { document, path };
}
