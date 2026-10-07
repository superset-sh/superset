import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { getCloudWorkspacesQueryKey } from "@/hooks/useCloudWorkspaces";
import { useSession } from "@/lib/auth/client";
import { errorCopy, transportFailureKind } from "@/lib/errors";
import { posthog } from "@/lib/posthog";
import { apiClient } from "@/lib/trpc/client";
import {
	type CloudGitlabSelection,
	cloudGitlabSelectionError,
	cloudGitlabSelectionKey,
	useCloudCreateSelection,
} from "@/screens/(authenticated)/(home)/hooks/useCloudCreateSelection/useCloudCreateSelection";
import { useAppReviewStore } from "@/screens/(authenticated)/stores/appReviewStore";

interface CreateCloudWorkspaceArgs {
	gitlab?: CloudGitlabSelection;
	/** Null means the repo's default branch, resolved by the branch query. */
	branch: string | null;
	/** Null when no environment exists yet; create cannot proceed without one. */
	environmentId: string | null;
	/** Built-in agent to launch with the message as its prompt; null for none. */
	agent: string | null;
	/** Null launches the agent's own default. Ignored without an agent. */
	model: string | null;
	effort: string | null;
	message: PromptInputMessage;
	/** Already-uploaded cloud ids; the sandbox pulls the bytes once it is up. */
	attachmentFileIds: string[];
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

	const selection = useCloudCreateSelection();
	const nativeKey = cloudGitlabSelectionKey(selection.gitlab);
	const latest = useRef(nativeKey);
	latest.current = nativeKey;
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		latest.current = nativeKey;
		return () => {
			live.current = false;
			latest.current = null;
		};
	}, [nativeKey]);
	const mutation = useMutation({
		mutationFn: async ({
			gitlab,
			branch,
			environmentId,
			agent,
			model,
			effort,
			message,
			attachmentFileIds,
		}: CreateCloudWorkspaceArgs) => {
			if (!gitlab && selection.isGitlab) throw cloudGitlabSelectionError();
			if (gitlab) {
				const key = cloudGitlabSelectionKey(gitlab);
				if (
					!live.current ||
					!key ||
					key !== latest.current ||
					gitlab.organizationId !== organizationId ||
					gitlab.environmentId !== environmentId
				)
					throw cloudGitlabSelectionError();
				const launchAgent = agent && message.text.trim() ? agent : undefined;
				const row = await apiClient.cloudWorkspace.create.mutate({
					organizationId: gitlab.organizationId,
					environmentId: gitlab.environmentId,
					gitlabCloneUrl: gitlab.cloneUrl,
					prompt: message.text.trim() || undefined,
					branch: branch ?? undefined,
					agent: launchAgent,
					model: launchAgent ? (model ?? undefined) : undefined,
					effort: launchAgent ? (effort ?? undefined) : undefined,
					...(launchAgent && attachmentFileIds.length > 0
						? { attachmentFileIds }
						: {}),
				});
				return row;
			}
			if (!organizationId) throw new Error("No active organization");
			if (!environmentId) {
				throw new Error(
					"Add an environment in Settings before creating a cloud workspace",
				);
			}
			// Only with something to say: an empty prompt leaves it idle.
			const launchAgent = agent && message.text.trim() ? agent : undefined;
			return apiClient.cloudWorkspace.create.mutate({
				organizationId,
				environmentId,
				prompt: message.text.trim() || undefined,
				// Omitted when unresolved: the server falls back to the repo's
				// actual default branch, which the client must not guess.
				branch: branch ?? undefined,
				agent: launchAgent,
				model: launchAgent ? (model ?? undefined) : undefined,
				effort: launchAgent ? (effort ?? undefined) : undefined,
				// Only with an agent to hand them to.
				...(launchAgent && attachmentFileIds.length > 0
					? { attachmentFileIds }
					: {}),
			});
		},
		onSuccess: (
			row: CloudWorkspaceRow,
			{ branch, agent, model, effort, message, gitlab },
		) => {
			// The API emits `workspace_created`; this is only the client asking.
			posthog.capture("workspace_create_requested", {
				workspace_id: row.id,
				organization_id: organizationId,
				host_kind: "cloud",
				source: "mobile_composer",
				base_branch: branch,
				agent: agent && message.text.trim() ? agent : null,
				model,
				effort,
			});
			useAppReviewStore.getState().recordWorkspaceCreated();
			// Seed the list before navigating: the workspace screen decides
			// between "provisioning" and "not found" off this cache, and even
			// one refetch round trip is long enough to flash the wrong one.
			const key = getCloudWorkspacesQueryKey(
				gitlab?.organizationId ?? organizationId,
			);
			queryClient.setQueryData<CloudWorkspaceRow[] | undefined>(key, (rows) =>
				rows
					? [row, ...rows.filter((existing) => existing.id !== row.id)]
					: [row],
			);
			void queryClient.invalidateQueries({ queryKey: key });
			if (
				live.current &&
				(!gitlab || cloudGitlabSelectionKey(gitlab) === latest.current)
			)
				router.push(`/(authenticated)/workspace/${row.id}`);
		},
		onError: (error, { branch, gitlab }) => {
			if (
				gitlab &&
				(!live.current || cloudGitlabSelectionKey(gitlab) !== latest.current)
			)
				return;
			posthog.capture("workspace_create_failed", {
				organization_id: organizationId,
				host_kind: "cloud",
				source: "mobile_composer",
				base_branch: branch,
				// Stable English, never the display copy below.
				failure_kind: transportFailureKind(error) ?? "server",
			});
			Alert.alert(
				i18n._(
					msg({
						message: "Could not create cloud workspace",
					}),
				),
				errorCopy(error),
			);
		},
	});
	const capture = (args: CreateCloudWorkspaceArgs) =>
		args.gitlab
			? Object.freeze({ ...args, gitlab: Object.freeze({ ...args.gitlab }) })
			: args;
	return {
		...mutation,
		mutateAsync: (
			args: CreateCloudWorkspaceArgs,
			options?: Parameters<typeof mutation.mutateAsync>[1],
		) => mutation.mutateAsync(capture(args), options),
		mutate: (
			args: CreateCloudWorkspaceArgs,
			options?: Parameters<typeof mutation.mutate>[1],
		) => mutation.mutate(capture(args), options),
	};
}
