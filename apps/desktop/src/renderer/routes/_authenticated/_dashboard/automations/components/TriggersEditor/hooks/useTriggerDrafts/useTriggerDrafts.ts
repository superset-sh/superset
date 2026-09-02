import {
	type DraftTrigger,
	describeTriggerProblems,
	summarizeTriggerProblems,
} from "@superset/shared/automation-triggers";
import { useMemo, useState } from "react";

/**
 * The editor's drafts, and the rules about when they may be written.
 *
 * Held locally and saved on request, unlike the rest of the page. A trigger is
 * invalid the moment it is added — "Comment added" with no repository chosen
 * yet — and the API rejects the whole set, so autosaving meant a new row was
 * saved, refused, and dropped on the next render. Saving silently once it
 * happened to become valid is no better: nothing tells you which edit crossed
 * the line, or that anything was written at all.
 *
 * Separate from the component because none of this needs a query, a plan or a
 * feature flag to be true, and all of it is worth being sure about.
 */
export function useTriggerDrafts(
	triggers: DraftTrigger[],
	onChange: (next: DraftTrigger[]) => undefined | Promise<unknown>,
) {
	const [drafts, setDrafts] = useState(triggers);
	const [dirty, setDirty] = useState(false);

	const savedKey = JSON.stringify(triggers);
	const [prevSavedKey, setPrevSavedKey] = useState(savedKey);
	if (savedKey !== prevSavedKey) {
		setPrevSavedKey(savedKey);
		// Adopt what was saved — it carries the ids the server assigned — unless
		// there are edits here, which by definition were never sent.
		if (!dirty) setDrafts(triggers);
	}

	const problems = useMemo(() => describeTriggerProblems(drafts), [drafts]);

	// Nothing is wrong until someone says they are done. Every trigger is
	// incomplete the instant it is added, so validating as you type marks a row
	// before anyone has had the chance to fill it in — the complaint lands
	// before the work. After a rejected save the problems stay live, so they
	// clear as each one is fixed rather than only on the next attempt.
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);

	const edit = (next: DraftTrigger[]) => {
		setDrafts(next);
		setDirty(true);
	};

	const save = async () => {
		// Always allowed: the button is what asks for validation, so refusing to
		// act while the set is invalid would leave no way to find out why.
		setSubmitted(true);
		if (problems.length > 0) return;

		setSaving(true);
		try {
			await onChange(drafts);
			setDirty(false);
			setSubmitted(false);
		} catch {
			// Stay dirty and keep the edits: this editor holds the only copy of
			// them, and the mutation has already reported why it failed.
		} finally {
			setSaving(false);
		}
	};

	const discard = () => {
		setDrafts(triggers);
		setDirty(false);
		setSubmitted(false);
	};

	return {
		drafts,
		dirty,
		saving,
		/** Marks on the rows — empty until a save has been attempted. */
		shownProblems: submitted ? problems : [],
		banner: submitted ? summarizeTriggerProblems(problems) : null,
		edit,
		add: (config: DraftTrigger["config"]) => edit([...drafts, { config }]),
		save,
		discard,
	};
}
