import { useCallback, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	ContentState,
	SaveResult,
	SharedFileDocument,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore";
import type { SkillListItem } from "../../../../hooks/useSkills";

interface UseSkillDocumentParams {
	skill: Pick<SkillListItem, "id" | "ref" | "name" | "path"> | null;
}

const NO_SKILL = { kind: "managed", name: "" } as const;

/**
 * Loads/saves a skill's SKILL.md through the `skills` router and exposes it
 * as a SharedFileDocument so the shared FileEditPane can host it. Unlike the
 * workspace fileDocumentStore this is a plain hook, not a module-singleton
 * store — only one skill is ever open at a time here, and there's no
 * concurrent writer to conflict with, so conflict/orphaned/hasExternalChange
 * stay permanently inert.
 */
export function useSkillDocument({ skill }: UseSkillDocumentParams) {
	const utils = electronTrpc.useUtils();
	const id = skill?.id ?? "";
	const ref = skill?.ref ?? NO_SKILL;
	const { data, isLoading, error } = electronTrpc.skills.getContent.useQuery(
		ref,
		{ enabled: skill !== null },
	);

	// Local edit state is scoped to `id` and reset synchronously (during
	// render, not an effect) whenever it changes — otherwise a leftover draft
	// from the previously previewed skill would briefly show up as the next
	// skill's editable content if it's reopened before an in-flight autosave
	// (see SkillPreviewDialog's close handler) has resolved.
	const [local, setLocal] = useState<{
		id: string;
		draft: string | null;
		saveError: Error | null;
	}>(() => ({ id, draft: null, saveError: null }));
	if (local.id !== id) {
		setLocal({ id, draft: null, saveError: null });
	}
	const draft = local.id === id ? local.draft : null;
	const saveError = local.id === id ? local.saveError : null;

	const savedContent = data?.content ?? null;
	const path = data?.path ?? skill?.path ?? null;

	const writeMutation = electronTrpc.skills.write.useMutation();

	const content: ContentState = useMemo(() => {
		if (isLoading) return { kind: "loading" };
		if (error) return { kind: "error", error: new Error(error.message) };
		if (savedContent === null) return { kind: "not-found" };
		return { kind: "text", value: draft ?? savedContent, revision: "" };
	}, [isLoading, error, savedContent, draft]);

	const dirty = draft !== null && draft !== savedContent;

	const setContent = useCallback(
		(next: string) => {
			setLocal({ id, draft: next, saveError: null });
		},
		[id],
	);

	const save = useCallback(async (): Promise<SaveResult> => {
		if (draft === null || draft === savedContent) {
			return { status: "saved", revision: "" };
		}
		const savingDraft = draft;
		try {
			await writeMutation.mutateAsync({ ref, content: savingDraft });
			// Awaited, not fire-and-forget: clearing the draft below makes
			// `content` fall back to `savedContent`, so the refetch must land
			// first or the view would flash back to the pre-save text until it
			// does.
			await utils.skills.getContent.invalidate(ref);
			// The description on the card comes from the frontmatter just saved.
			void utils.skills.list.invalidate();
			// Only clear the draft if it still matches what was just sent —
			// typing more during the in-flight save must not discard those
			// newer, still-unsaved edits.
			setLocal((prev) =>
				prev.id === id && prev.draft === savingDraft
					? { ...prev, draft: null, saveError: null }
					: prev,
			);
			return { status: "saved", revision: "" };
		} catch (err) {
			const saveFailure =
				err instanceof Error ? err : new Error("Failed to save skill");
			setLocal((prev) =>
				prev.id === id ? { ...prev, saveError: saveFailure } : prev,
			);
			return { status: "error", error: saveFailure };
		}
	}, [draft, savedContent, writeMutation, ref, id, utils]);

	const clearSaveError = useCallback(() => {
		setLocal((prev) => (prev.id === id ? { ...prev, saveError: null } : prev));
	}, [id]);

	const document: SharedFileDocument = {
		id: `skill:${id}`,
		workspaceId: "skills",
		absolutePath: path ?? skill?.name ?? "",
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
			setLocal({ id, draft: null, saveError: null });
			await utils.skills.getContent.invalidate(ref);
		},
		compareWithDisk: async () => {},
		loadUnlimited: async () => {},
		resolveConflict: async () => {},
		clearSaveError,
		subscribe: () => () => {},
		getVersion: () => 0,
	};

	return { document, path };
}
