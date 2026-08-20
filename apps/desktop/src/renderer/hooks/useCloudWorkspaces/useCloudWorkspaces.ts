import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { RouterOutputs } from "@superset/trpc";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export type CloudWorkspaceRow = RouterOutputs["cloudWorkspace"]["list"][number];

/**
 * Someone is watching a provisioning row, so poll like it: a warm sandbox is
 * up in about a second, and this poll is now the longest part of the wait
 * between pressing create and the workspace opening.
 */
const PROVISIONING_POLL_MS = 1_000;
const IDLE_POLL_MS = 30_000;

export interface CloudWorkspacesValue {
	workspaces: CloudWorkspaceRow[];
	organizationId: string | null;
}

/**
 * Every cloud workspace in the active organization, including the ones still
 * provisioning and the ones that failed. The row exists from the moment create
 * returns, and both the sidebar and the workspace route render it long before
 * a sandbox is behind it.
 *
 * Shared rather than queried per consumer so the polling cadence is one
 * decision: while anything is provisioning there is a screen waiting on the
 * flip to `ready`, and a 30s poll would leave it spinning for half a minute
 * after the sandbox came up.
 */
export function useCloudWorkspaces(): CloudWorkspacesValue {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = cloudTrpc.cloudWorkspace.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled: Boolean(enabled && organizationId),
			refetchInterval: (current) =>
				current.state.data?.some((row) => row.status === "provisioning")
					? PROVISIONING_POLL_MS
					: IDLE_POLL_MS,
		},
	);

	return { workspaces: query.data ?? [], organizationId };
}
