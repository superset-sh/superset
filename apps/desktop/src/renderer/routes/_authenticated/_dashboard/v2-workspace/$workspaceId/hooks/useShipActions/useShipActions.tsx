import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";

interface UseShipActionsOptions {
	workspaceId: string;
	onRefresh: () => void;
	isPrFormOpen: boolean;
	onCommitted: () => void;
	onPrCreated: () => void;
	enabled?: boolean;
}

export type ShipActions = ReturnType<typeof useShipActions>;

export function useShipActions({
	workspaceId,
	onRefresh,
	isPrFormOpen,
	onCommitted,
	onPrCreated,
	enabled = true,
}: UseShipActionsOptions) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { workspace } = useWorkspace();
	const status = useWorkspaceGitStatus();
	const canCreatePr = workspace.type !== "session";

	const [commitMessage, setCommitMessage] = useState("");
	const [prTitle, setPrTitle] = useState("");
	const [prBody, setPrBody] = useState("");
	const [prDraft, setPrDraft] = useState(false);

	// The branch's commits ahead of its base: prefills the PR title from the
	// latest subject, and gates Create PR — GitHub rejects a PR with no
	// commits between base and head, so the action disables instead of
	// surfacing that as a failure toast. Counted against the configured
	// branch.<name>.base (the base createForWorkspace actually opens
	// against) — measuring against the repo default gets stacked branches
	// exactly backwards.
	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ enabled: enabled && canCreatePr, staleTime: Number.POSITIVE_INFINITY },
	);
	const commitsQuery = workspaceTrpc.git.listCommits.useQuery(
		{
			workspaceId,
			baseBranch: baseBranchQuery.data?.baseBranch ?? undefined,
		},
		{
			enabled: enabled && canCreatePr && baseBranchQuery.isSuccess,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);
	// Optimistic while loading so the action doesn't flash disabled.
	const hasCommitsAhead =
		commitsQuery.data == null || commitsQuery.data.commits.length > 0;
	const latestSubject = commitsQuery.data?.commits[0]?.message ?? "";

	const commitMutation = workspaceTrpc.git.commit.useMutation({
		onSuccess: () => {
			toast.success(t({ message: "Committed" }));
			onCommitted();
			setCommitMessage("");
			// The 10s poll is too slow here: Create PR must not sit disabled
			// on pre-commit data.
			void commitsQuery.refetch();
			onRefresh();
		},
		onError: (error) => {
			toast.error(
				t({
					message: `Commit failed: ${error.message}`,
				}),
			);
		},
	});

	const pushMutation = workspaceTrpc.git.push.useMutation({
		onSuccess: () => {
			toast.success(t({ message: "Pushed" }));
			onRefresh();
		},
		onError: (error) => {
			toast.error(
				t({
					message: `Push failed: ${error.message}`,
				}),
			);
		},
	});

	// A second push mutation with no global toasts: the create-PR flow runs
	// its own labeled toast sequence, and reusing `pushMutation` there popped
	// a stray "Pushed" toast mid-flow (and a duplicate, mislabeled error).
	const flowPushMutation = workspaceTrpc.git.push.useMutation({
		onSuccess: () => onRefresh(),
	});
	const createPrMutation =
		workspaceTrpc.pullRequests.createForWorkspace.useMutation();

	// Seed the title from the latest commit subject when the PR form opens. A
	// render-time `prTitle || latestSubject` fallback made the field
	// uneditable: clearing it snapped the prefill straight back. The effect
	// covers the form opening before listCommits resolves, but never writes
	// over the user's own typing (or deliberate clearing).
	const prTitleTouchedRef = useRef(false);
	const seedPrTitle = () => setPrTitle((prev) => prev || latestSubject);
	const editPrTitle = (value: string) => {
		prTitleTouchedRef.current = true;
		setPrTitle(value);
	};
	useEffect(() => {
		if (
			isPrFormOpen &&
			!prTitleTouchedRef.current &&
			prTitle === "" &&
			latestSubject
		) {
			setPrTitle(latestSubject);
		}
	}, [isPrFormOpen, prTitle, latestSubject]);

	const isShipping =
		pushMutation.isPending ||
		flowPushMutation.isPending ||
		createPrMutation.isPending;

	const changedPaths = useMemo(() => {
		const data = status.data;
		if (!data) return [];
		return [...new Set([...data.staged, ...data.unstaged].map((f) => f.path))];
	}, [status.data]);
	// Fallback when the message box is left empty. Deliberately not
	// translated: commit messages live in git history, not the UI.
	const defaultCommitMessage =
		changedPaths.length === 1
			? `Update ${changedPaths[0]?.split("/").pop()}`
			: changedPaths.length > 1
				? `Update ${changedPaths.length} files`
				: "Update";

	const commit = () => {
		if (commitMutation.isPending) return;
		const message = commitMessage.trim() || defaultCommitMessage;
		commitMutation.mutate({ workspaceId, message });
	};

	const push = () => pushMutation.mutate({ workspaceId });

	const createPr = async () => {
		const title = prTitle.trim();
		if (!title || !hasCommitsAhead) return;
		const toastId = toast.loading(t({ message: "Pushing..." }));
		// Always push first rather than trusting `needsPush`: the sync
		// snapshot can be up to 10s stale right after a commit, and skipping
		// the push then would open the PR at the old remote tip. Pushing an
		// already-synced branch is a cheap no-op.
		try {
			await flowPushMutation.mutateAsync({ workspaceId });
		} catch (error) {
			toast.error(
				t({
					message: `Push failed: ${error instanceof Error ? error.message : String(error)}`,
				}),
				{ id: toastId },
			);
			return;
		}
		toast.loading(
			t({
				message: "Creating PR...",
			}),
			{ id: toastId },
		);
		try {
			const created = await createPrMutation.mutateAsync({
				workspaceId,
				title,
				body: prBody.trim() || undefined,
				draft: prDraft,
			});
			toast.success(
				t({
					message: `PR #${created.number} created`,
				}),
				{
					id: toastId,
					description: (
						<a
							href={created.url}
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2 transition-colors hover:text-foreground"
						>
							{t({
								message: "PR URL",
							})}
						</a>
					),
					action: {
						label: t({
							message: "Open",
						}),
						// The toast outlives this page: the user may have switched
						// workspaces by the time they click. A workspace-scoped intent
						// plus navigation lands the pane in the right store either way.
						onClick: () => {
							const ref = pullRequestRefFromUrl(created.url);
							if (!ref) {
								window.open(created.url, "_blank");
								return;
							}
							usePullRequestPaneIntent.getState().request({
								workspaceId,
								...ref,
							});
							void navigateToV2Workspace(workspaceId, navigate);
						},
					},
				},
			);
			onPrCreated();
			setPrTitle("");
			prTitleTouchedRef.current = false;
			setPrBody("");
			setPrDraft(false);
			onRefresh();
		} catch (error) {
			toast.error(
				t({
					message: `Create PR failed: ${error instanceof Error ? error.message : String(error)}`,
				}),
				{ id: toastId },
			);
		}
	};

	return {
		canCreatePr,
		hasCommitsAhead,
		commitsLoaded: commitsQuery.isSuccess,
		commitMessage,
		setCommitMessage,
		defaultCommitMessage,
		prTitle,
		editPrTitle,
		seedPrTitle,
		prBody,
		setPrBody,
		prDraft,
		setPrDraft,
		commit,
		isCommitting: commitMutation.isPending,
		push,
		isPushing: pushMutation.isPending,
		createPr,
		isShipping,
	};
}
