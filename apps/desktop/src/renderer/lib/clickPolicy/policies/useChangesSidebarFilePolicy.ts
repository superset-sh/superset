import { useCallback, useMemo } from "react";
import {
	buildChangesSidebarFileHint,
	type ChangesSidebarFileIntent,
	resolveChangesSidebarFileIntent,
	tierForChangesSidebarFileIntent,
} from "./changesSidebarFilePolicy";
import { useSidebarFilePolicy } from "./useSidebarFilePolicy";

export function useChangesSidebarFilePolicy() {
	const policy = useSidebarFilePolicy();

	const getIntent = useCallback(
		(event: Parameters<typeof resolveChangesSidebarFileIntent>[1]) =>
			resolveChangesSidebarFileIntent(policy.map, event),
		[policy.map],
	);
	const tierForIntent = useCallback(
		(intent: ChangesSidebarFileIntent) =>
			tierForChangesSidebarFileIntent(policy.map, intent),
		[policy.map],
	);
	const hint = useMemo(
		() => buildChangesSidebarFileHint(policy.map),
		[policy.map],
	);

	return { ...policy, getIntent, tierForIntent, hint };
}
