import {
	type DraftTrigger,
	describeTriggerProblems,
	summarizeTriggerProblems,
} from "@superset/shared/automation-triggers";
import { useMemo, useState } from "react";

export interface AutomationDraft {
	name: string;
	prompt: string;
	agent: string;
	targetHostId: string | null;
	v2ProjectId: string | null;
	v2WorkspaceId: string | null;
	tags: string[];
	triggers: DraftTrigger[];
}

/**
 * One draft for the whole automation, saved on request.
 *
 * The trigger set is why nothing here autosaves: a trigger is invalid the
 * moment it is added, and the API rejects the whole set — so a new row would
 * be saved, refused, and dropped on the next render.
 */
export function useAutomationDraft(
	saved: AutomationDraft,
	commit: (draft: AutomationDraft) => undefined | Promise<unknown>,
) {
	const [draft, setDraft] = useState(saved);
	const [dirty, setDirty] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);

	const savedKey = JSON.stringify(saved);
	const [prevSavedKey, setPrevSavedKey] = useState(savedKey);
	if (savedKey !== prevSavedKey) {
		setPrevSavedKey(savedKey);
		// Unsaved edits were never sent, so nothing upstream can supersede them.
		if (!dirty) setDraft(saved);
	}

	const problems = useMemo(
		() => describeTriggerProblems(draft.triggers),
		[draft.triggers],
	);

	const edit = (patch: Partial<AutomationDraft>) => {
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
	};

	const save = async () => {
		setSubmitted(true);
		if (problems.length > 0) return;
		setSaving(true);
		try {
			await commit(draft);
			setDirty(false);
			setSubmitted(false);
		} catch {
			// The page holds the only copy of these edits; the mutation already
			// reported why it failed.
		} finally {
			setSaving(false);
		}
	};

	return {
		draft,
		dirty,
		saving,
		// Every trigger is incomplete the instant it is added, so complaints wait
		// for a save attempt rather than landing before the work.
		shownProblems: submitted ? problems : [],
		banner: submitted ? summarizeTriggerProblems(problems) : null,
		edit,
		editTriggers: (triggers: DraftTrigger[]) => edit({ triggers }),
		addTrigger: (config: DraftTrigger["config"]) =>
			edit({ triggers: [...draft.triggers, { config }] }),
		save,
		discard: () => {
			setDraft(saved);
			setDirty(false);
			setSubmitted(false);
		},
	};
}
