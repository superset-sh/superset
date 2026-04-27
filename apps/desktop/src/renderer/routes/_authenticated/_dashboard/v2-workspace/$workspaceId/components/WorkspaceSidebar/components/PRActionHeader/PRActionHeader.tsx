import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	VscChevronDown,
	VscGitMerge,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { PRFlowDispatch } from "../../hooks/usePRFlowDispatch";
import {
	type PRFlowState,
	selectActionButton,
	type UnavailableReason,
} from "./utils/getPRFlowState";

interface PRActionHeaderProps {
	workspaceId: string;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	/**
	 * Gates the "Create PR" entry point. When false, the no-PR state renders
	 * a muted icon with a tooltip instead of a clickable create button.
	 * Will flip to true once the chat-driven create flow lands in v2.
	 */
	createPREnabled?: boolean;
}

export function PRActionHeader({
	workspaceId,
	state,
	dispatch,
	onRetry,
	createPREnabled = true,
}: PRActionHeaderProps) {
	const action = selectActionButton(state);

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-2 dark:bg-muted/35">
			<div className="ml-auto flex items-center">
				<ActionSlot
					variant={action}
					state={state}
					dispatch={dispatch}
					onRetry={onRetry}
					createPREnabled={createPREnabled}
					workspaceId={workspaceId}
				/>
			</div>
		</div>
	);
}

/**
 * Mirrors v1's PRButton state machine: loading spinner, muted icon (with
 * tooltip) when create is unavailable, clickable icon when create is
 * available, link + merge dropdown for an open PR, plain link for closed/
 * merged/draft PRs. Text labels are intentionally absent — state is
 * conveyed through icons.
 */
function ActionSlot({
	variant,
	state,
	dispatch,
	onRetry,
	createPREnabled,
	workspaceId,
}: {
	variant: ReturnType<typeof selectActionButton>;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	createPREnabled: boolean;
	workspaceId: string;
}) {
	switch (variant.kind) {
		case "hidden":
			// `pr-exists` lands here — render the link + merge dropdown.
			return (
				<PRStatusGroup
					state={state}
					workspaceId={workspaceId}
					onRefresh={onRetry}
				/>
			);

		case "disabled-tooltip":
			return <UnavailableIcon reason={variant.reasonKind} />;

		case "create-pr-dropdown":
			if (!createPREnabled) {
				return (
					<UnavailableIcon
						reason="create-disabled"
						tooltip="Create PR coming soon"
					/>
				);
			}
			return <CreatePRSplitButton state={state} dispatch={dispatch} />;

		case "cancel-busy":
			return (
				<>
					<PRStatusGroup
						state={state}
						workspaceId={workspaceId}
						onRefresh={onRetry}
					/>
					<VscLoading className="ml-1.5 size-4 animate-spin text-muted-foreground" />
				</>
			);

		case "retry":
			return (
				<button
					type="button"
					onClick={onRetry}
					aria-label="Retry loading pull request"
					className="flex items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<VscGitPullRequest className="size-4" />
				</button>
			);
	}
}

function UnavailableIcon({
	reason,
	tooltip,
}: {
	reason: UnavailableReason | "create-disabled";
	tooltip?: string;
}) {
	const tooltipText = tooltip ?? unavailableTooltip(reason);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex items-center text-muted-foreground/40">
					<VscGitPullRequest className="size-4" />
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltipText}</TooltipContent>
		</Tooltip>
	);
}

function unavailableTooltip(
	reason: UnavailableReason | "create-disabled",
): string {
	switch (reason) {
		case "no-repo":
			return "No GitHub repository connected";
		case "default-branch":
			return "Switch to a feature branch to create a pull request";
		case "detached-head":
			return "Checkout a branch to create a pull request";
		case "create-disabled":
			return "Create PR coming soon";
	}
}

function CreatePRSplitButton({
	state,
	dispatch,
}: {
	state: PRFlowState;
	dispatch: PRFlowDispatch;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => dispatch({ state, draft: false })}
					aria-label="Create pull request"
					className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
				>
					<VscGitPullRequest className="size-4" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">Create Pull Request</TooltipContent>
		</Tooltip>
	);
}

/**
 * Mirrors v1's PRButton: shows the PR link with status icon, plus a merge
 * dropdown (squash / merge / rebase) when the PR is open and not a draft.
 * Closed/merged/draft PRs render as a plain link.
 */
function PRStatusGroup({
	state,
	workspaceId,
	onRefresh,
}: {
	state: PRFlowState;
	workspaceId: string;
	onRefresh?: () => void;
}) {
	const pr =
		state.kind === "pr-exists"
			? state.pr
			: state.kind === "busy" || state.kind === "error"
				? state.pr
				: null;

	// Triggers a GitHub→host-service-DB sync for this workspace's PR. Without
	// this, post-merge UI state lags by up to ~30s waiting for the next
	// background sync tick. Called after a successful merge before refetching
	// the local query.
	const refreshPRMutation =
		workspaceTrpc.pullRequests.refreshByWorkspaces.useMutation();

	const mergePRMutation = workspaceTrpc.github.mergePR.useMutation({
		onMutate: () => {
			const toastId = toast.loading("Merging PR...");
			return { toastId };
		},
		onSuccess: async (_data, _variables, context) => {
			toast.success("PR merged", { id: context?.toastId });
			try {
				await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
			} finally {
				onRefresh?.();
			}
		},
		onError: (error, _variables, context) => {
			toast.error(`Merge failed: ${error.message}`, { id: context?.toastId });
		},
	});

	if (!pr) return null;

	const linkState = pr.isDraft
		? "draft"
		: pr.state === "merged"
			? "merged"
			: pr.state === "closed"
				? "closed"
				: "open";
	const canMerge = pr.state === "open" && !pr.isDraft;

	const handleMerge = (mergeMethod: "merge" | "squash" | "rebase") => {
		mergePRMutation.mutate({
			owner: pr.repoOwner,
			repo: pr.repoName,
			pullNumber: pr.number,
			mergeMethod,
		});
	};

	if (!canMerge) {
		return (
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 transition-opacity hover:opacity-80"
			>
				<PRIcon state={linkState} className="size-4" />
				<span className="font-mono text-xs text-muted-foreground">
					#{pr.number}
				</span>
			</a>
		);
	}

	return (
		<div
			className="flex items-center overflow-hidden rounded border border-border"
			aria-busy={mergePRMutation.isPending}
		>
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 px-1.5 py-0.5 transition-colors hover:bg-accent"
			>
				<PRIcon state={linkState} className="size-4" />
				<span className="font-mono text-xs text-muted-foreground">
					#{pr.number}
				</span>
			</a>
			<div className="h-full w-px bg-border" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center px-1 py-0.5 transition-colors hover:bg-accent"
						disabled={mergePRMutation.isPending}
						aria-label={
							mergePRMutation.isPending
								? "Merging pull request"
								: "Open merge options"
						}
					>
						{mergePRMutation.isPending ? (
							<VscLoading className="size-3 animate-spin text-muted-foreground" />
						) : (
							<VscChevronDown className="size-3 text-muted-foreground" />
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
						Merge
					</DropdownMenuLabel>
					<DropdownMenuItem
						onClick={() => handleMerge("squash")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						Squash and merge
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMerge("merge")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						Create merge commit
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMerge("rebase")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						Rebase and merge
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
