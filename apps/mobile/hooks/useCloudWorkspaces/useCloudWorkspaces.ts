import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useFeatureFlag } from "posthog-react-native";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { pruneSandboxAccess } from "@/lib/sandbox-access";
import { apiClient } from "@/lib/trpc/client";

export type CloudWorkspaceRow = RouterOutputs["cloudWorkspace"]["list"][number];

/**
 * Someone is watching a provisioning row, so poll like it: a warm sandbox is
 * up in about a second, and this poll is the longest part of the wait between
 * pressing create and the workspace opening.
 */
const PROVISIONING_POLL_MS = 1_000;
const IDLE_POLL_MS = 30_000;

const NO_ROWS: CloudWorkspaceRow[] = [];

export function getCloudWorkspacesQueryKey(organizationId: string | null) {
	return ["cloud", "cloudWorkspace", "list", organizationId] as const;
}

export interface CloudWorkspacesValue {
	workspaces: CloudWorkspaceRow[];
	organizationId: string | null;
	/** True once the list answered (or the feature is off for this user). */
	isReady: boolean;
}

/**
 * Every cloud workspace in the active organization, including the ones still
 * provisioning and the ones that failed: the row exists from the moment create
 * returns, and both the home list and the workspace screen render it long
 * before a sandbox is behind it.
 *
 * Gated twice, like desktop: the PostHog flag decides whether to ask, and the
 * API refuses non-internal accounts — a FORBIDDEN answer is "no cloud
 * workspaces", not an error to show.
 */
export function useCloudWorkspaces(): CloudWorkspacesValue {
	const enabledByFlag = Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useQuery({
		queryKey: getCloudWorkspacesQueryKey(organizationId),
		enabled: enabledByFlag && organizationId !== null,
		networkMode: "always" as const,
		retry: (count, error) =>
			!(error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") &&
			count < 2,
		refetchInterval: (current) =>
			current.state.data?.some((row) => row.status === "provisioning")
				? PROVISIONING_POLL_MS
				: IDLE_POLL_MS,
		queryFn: async (): Promise<CloudWorkspaceRow[]> => {
			if (!organizationId) return NO_ROWS;
			try {
				return await apiClient.cloudWorkspace.list.query({ organizationId });
			} catch (error) {
				if (
					error instanceof TRPCClientError &&
					error.data?.code === "FORBIDDEN"
				) {
					return NO_ROWS;
				}
				throw error;
			}
		},
	});

	// Whatever the list stops naming loses its credentials: an org switch or a
	// FORBIDDEN answer lands here as a new (possibly empty) list and clears the
	// grants the previous one earned. Losing the scope entirely — sign-out,
	// flag off — disables the query, so that case prunes explicitly rather
	// than waiting for data that will never come.
	const rows = query.data;
	const hasScope = enabledByFlag && organizationId !== null;
	useEffect(() => {
		if (!hasScope) {
			pruneSandboxAccess(new Set());
			return;
		}
		if (!rows) return;
		pruneSandboxAccess(new Set(rows.map((row) => row.id)));
	}, [hasScope, rows]);

	return {
		workspaces: query.data ?? NO_ROWS,
		organizationId,
		isReady:
			!enabledByFlag ||
			organizationId === null ||
			query.isSuccess ||
			query.isError,
	};
}
