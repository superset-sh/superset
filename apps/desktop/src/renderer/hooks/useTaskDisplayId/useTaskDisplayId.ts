import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback } from "react";

export interface TaskIdentity {
	slug: string;
	externalProvider: string | null;
	externalKey: string | null;
}

export function useTaskDisplayId() {
	const showOwnSlugs = useFeatureFlagEnabled(FEATURE_FLAGS.TASK_KEYS) ?? false;
	return useCallback(
		(task: TaskIdentity) =>
			!showOwnSlugs && task.externalProvider === "linear" && task.externalKey
				? task.externalKey
				: task.slug,
		[showOwnSlugs],
	);
}
