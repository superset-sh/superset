import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { RouterOutputs } from "@superset/trpc";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export type CloudWorkspaceRow = RouterOutputs["cloudWorkspace"]["list"][number];

/**
 * Someone is watching a provisioning row, so poll like it: a warm sandbox is
 * up in about a second, and this poll is now the longest part of the wait
 * between pressing create and the workspace opening.
 */
const PROVISIONING_POLL_MS = 1_000;

export interface CloudWorkspacesValue {
	workspaces: CloudWorkspaceRow[];
	organizationId: string | null;
	/** True once the list has been fetched, or when it never will be (flag off, no organization). */
	isSettled: boolean;
}

/**
 * Every cloud workspace in the active organization, including the ones still
 * provisioning and the ones that failed. The row exists from the moment create
 * returns, and both the sidebar and the workspace route render it long before
 * a sandbox is behind it.
 *
 * Shared rather than queried per consumer so the refetch cadence is one
 * decision: while anything is provisioning there is a screen waiting on the
 * flip to `ready`, which the fast poll catches within a second; every other
 * change arrives as a realtime nudge.
 */
export function useCloudWorkspaces(): CloudWorkspacesValue {
	const flagEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const organizationId = useActiveOrganizationId();
	const enabled = Boolean(flagEnabled && organizationId);

	const query = cloudTrpc.cloudWorkspace.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled,
			// The realtime channel nudges on every status write; the fast poll
			// only bridges a provisioning row so `ready` lands within a second.
			refetchInterval: (current) =>
				current.state.data?.some((row) => row.status === "provisioning")
					? PROVISIONING_POLL_MS
					: false,
		},
	);

	return {
		workspaces: query.data ?? [],
		organizationId,
		isSettled: !enabled || query.isFetched,
	};
}
