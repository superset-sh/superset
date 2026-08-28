import { i18n } from "@superset/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { getCloudWorkspacesQueryKey } from "@/hooks/useCloudWorkspaces";
import { useSession } from "@/lib/auth/client";
import { posthog } from "@/lib/posthog";
import { apiClient } from "@/lib/trpc/client";
import type { NewChatTarget } from "../useNewChatTargets";

interface CreateCloudWorkspaceArgs {
	target: NewChatTarget;
	/** Null means the repo's default branch, resolved by the branch query. */
	branch: string | null;
	message: PromptInputMessage;
}

/**
 * One API call, then navigate: create returns as soon as the row exists and
 * the workspace screen renders the provisioning state itself. The prompt only
 * feeds the server-side auto-name today — the sandbox launching the agent
 * from it is a follow-up that belongs server-side, not choreographed here.
 */
export function useCreateCloudWorkspace() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useMutation({
		mutationFn: async ({
			target,
			branch,
			message,
		}: CreateCloudWorkspaceArgs) => {
			if (!organizationId) throw new Error("No active organization");
			if (message.attachments.length > 0) {
				// Attachments today are written to a host, and this workspace's
				// host doesn't exist yet — blob-backed attachments are the fix.
				throw new Error(
					"Attachments are not supported for cloud workspaces yet",
				);
			}
			return apiClient.cloudWorkspace.create.mutate({
				organizationId,
				projectId: target.projectId,
				prompt: message.text.trim() || undefined,
				// Omitted when unresolved: the server falls back to the repo's
				// actual default branch, which the client must not guess.
				branch: branch ?? undefined,
			});
		},
		onSuccess: (row: CloudWorkspaceRow, { target, branch }) => {
			// The API emits `workspace_created`; this is only the client asking.
			posthog.capture("workspace_create_requested", {
				workspace_id: row.id,
				project_id: target.projectId,
				organization_id: organizationId,
				host_kind: "cloud",
				source: "mobile_composer",
				base_branch: branch,
				// Nothing launches on a cloud create today; the prompt only feeds
				// the server-side auto-name.
				agent: null,
			});
			// Seed the list before navigating: the workspace screen decides
			// between "provisioning" and "not found" off this cache, and even
			// one refetch round trip is long enough to flash the wrong one.
			const key = getCloudWorkspacesQueryKey(organizationId);
			queryClient.setQueryData<CloudWorkspaceRow[] | undefined>(key, (rows) =>
				rows ? [row, ...rows] : [row],
			);
			void queryClient.invalidateQueries({ queryKey: key });
			router.push(`/(authenticated)/workspace/${row.id}`);
		},
		onError: (error, { target, branch }) => {
			posthog.capture("workspace_create_failed", {
				project_id: target.projectId,
				organization_id: organizationId,
				host_kind: "cloud",
				source: "mobile_composer",
				base_branch: branch,
			});
			Alert.alert(
				i18n._({
					id: "mobile.cloudWorkspace.createFailed",
					message: "Could not create cloud workspace",
				}),
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
