import { Button } from "@superset/ui/button";
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
import { cn } from "@superset/ui/utils";
import {
	LuChevronDown,
	LuGitMerge,
	LuGitPullRequest,
	LuLoader,
} from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { PRFlowDispatch } from "../../hooks/usePRFlowDispatch";
import {
	type PRFlowState,
	selectActionButton,
	selectStatusBadge,
} from "./utils/getPRFlowState";

interface PRActionHeaderProps {
	workspaceId: string;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	onCancelBusy?: () => void;
	/**
	 * Gates the "Create PR" dropdown. When false, the create button is hidden
	 * but the merge dropdown for an existing PR (and the link/badge) still
	 * renders. Lets us ship the PR status group before the chat-driven create
	 * flow is available in v2.
	 */
	createPREnabled?: boolean;
}

export function PRActionHeader({
	workspaceId,
	state,
	dispatch,
	onRetry,
	onCancelBusy,
	createPREnabled = true,
}: PRActionHeaderProps) {
	const badge = selectStatusBadge(state);
	const action = selectActionButton(state);

	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-2 dark:bg-muted/35">
			<div className="flex min-w-0 items-center gap-1.5">
				{badge && (
					<span className="truncate text-[11px] text-muted-foreground">
						{badge}
					</span>
				)}
			</div>

			<div className="ml-auto flex items-center">
				<ActionButton
					variant={action}
					state={state}
					dispatch={dispatch}
					onRetry={onRetry}
					onCancelBusy={onCancelBusy}
					createPREnabled={createPREnabled}
					workspaceId={workspaceId}
				/>
			</div>
		</div>
	);
}

function ActionButton({
	variant,
	state,
	dispatch,
	onRetry,
	onCancelBusy,
	createPREnabled,
	workspaceId,
}: {
	variant: ReturnType<typeof selectActionButton>;
	state: PRFlowState;
	dispatch: PRFlowDispatch;
	onRetry?: () => void;
	onCancelBusy?: () => void;
	createPREnabled: boolean;
	workspaceId: string;
}) {
	switch (variant.kind) {
		case "hidden":
			// Even when no action button shows, render the PR group if a PR exists.
			return (
				<PRStatusGroup
					state={state}
					workspaceId={workspaceId}
					onRefresh={onRetry}
				/>
			);

		case "disabled-tooltip":
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<Button
								size="sm"
								variant="outline"
								disabled
								className={cn("h-7 gap-1 text-xs", "opacity-60")}
							>
								<LuGitPullRequest className="size-3.5" />
								Create PR
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="bottom">{variant.reason}</TooltipContent>
				</Tooltip>
			);

		case "create-pr-dropdown":
			if (!createPREnabled) return null;
			return <CreatePRSplitButton state={state} dispatch={dispatch} />;

		case "cancel-busy":
			return (
				<>
					<PRStatusGroup
						state={state}
						workspaceId={workspaceId}
						onRefresh={onRetry}
					/>
					<Button
						size="sm"
						variant="outline"
						className="ml-1.5 h-7 text-xs"
						onClick={onCancelBusy}
					>
						Cancel
					</Button>
				</>
			);

		case "retry":
			return (
				<>
					<PRStatusGroup
						state={state}
						workspaceId={workspaceId}
						onRefresh={onRetry}
					/>
					<Button
						size="sm"
						variant="outline"
						className="ml-1.5 h-7 text-xs"
						onClick={onRetry}
					>
						Retry
					</Button>
				</>
			);
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
		<div className="flex items-stretch overflow-hidden rounded border border-border">
			<button
				type="button"
				className="flex items-center gap-1 px-2 py-1 text-xs font-medium hover:bg-accent"
				onClick={() => dispatch({ state, draft: false })}
			>
				<LuGitPullRequest className="size-3.5" />
				Create PR
			</button>
			<div className="w-px bg-border" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Create PR options"
						className="flex items-center px-1 hover:bg-accent"
					>
						<LuChevronDown className="size-3.5 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem
						className="text-xs"
						onClick={() => dispatch({ state, draft: false })}
					>
						<LuGitPullRequest className="size-3.5" />
						Create PR
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-xs"
						onClick={() => dispatch({ state, draft: true })}
					>
						<LuGitPullRequest className="size-3.5" />
						Create draft PR
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
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
				className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 transition-colors hover:bg-accent"
			>
				<PRIcon state={linkState} className="size-3.5" />
				<span className="font-mono text-[11px] text-muted-foreground">
					#{pr.number}
				</span>
			</a>
		);
	}

	return (
		<div
			className="flex items-stretch overflow-hidden rounded border border-border"
			aria-busy={mergePRMutation.isPending}
		>
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 px-1.5 py-0.5 transition-colors hover:bg-accent"
			>
				<PRIcon state={linkState} className="size-3.5" />
				<span className="font-mono text-[11px] text-muted-foreground">
					#{pr.number}
				</span>
			</a>
			<div className="w-px bg-border" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center px-1 transition-colors hover:bg-accent"
						disabled={mergePRMutation.isPending}
						aria-label={
							mergePRMutation.isPending
								? "Merging pull request"
								: "Open merge options"
						}
					>
						{mergePRMutation.isPending ? (
							<LuLoader className="size-3 animate-spin text-muted-foreground" />
						) : (
							<LuChevronDown className="size-3 text-muted-foreground" />
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
						<LuGitMerge className="size-3.5" />
						Squash and merge
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMerge("merge")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<LuGitMerge className="size-3.5" />
						Create merge commit
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMerge("rebase")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<LuGitMerge className="size-3.5" />
						Rebase and merge
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
