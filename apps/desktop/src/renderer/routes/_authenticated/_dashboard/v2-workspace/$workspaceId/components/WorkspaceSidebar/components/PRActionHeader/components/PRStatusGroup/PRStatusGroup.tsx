import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { VscChevronDown, VscGitMerge, VscLoading } from "react-icons/vsc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { computeChecksRollup } from "../../utils/computeChecksStatus";
import type { PRFlowState } from "../../utils/getPRFlowState";
import { PRDetailCard } from "./components/PRDetailCard";
import { PRStatusIndicators } from "./components/PRStatusIndicators";

interface PRStatusGroupProps {
	state: PRFlowState;
	workspaceId: string;
	onRefresh?: () => void;
}

/**
 * v1-style PR badge sitting on the right of the action header — link to the
 * PR with status icon, compact CI/review indicators next to the number, plus
 * a merge dropdown when the PR is open and not a draft. Hovering the link
 * surfaces a rich detail popover (title, branches, CI summary, review status,
 * last activity).
 *
 * Closed/merged/draft PRs render the link without the merge dropdown.
 * Indicators are suppressed past `open`/`draft` since post-merge CI/review
 * state is historical noise.
 */
export function PRStatusGroup({
	state,
	workspaceId,
	onRefresh,
}: PRStatusGroupProps) {
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

	const checks = useMemo(
		() => (pr ? computeChecksRollup(pr.checks) : null),
		[pr],
	);

	if (!pr || !checks) return null;

	const linkState = pr.isDraft
		? "draft"
		: pr.state === "merged"
			? "merged"
			: pr.state === "closed"
				? "closed"
				: "open";
	const canMerge = pr.state === "open" && !pr.isDraft;
	const showIndicators = pr.state === "open"; // includes draft

	const handleMerge = (mergeMethod: "merge" | "squash" | "rebase") => {
		mergePRMutation.mutate({
			owner: pr.repoOwner,
			repo: pr.repoName,
			pullNumber: pr.number,
			mergeMethod,
		});
	};

	return (
		<div
			className="flex items-center overflow-hidden rounded border border-border"
			aria-busy={mergePRMutation.isPending}
		>
			<HoverCard openDelay={150} closeDelay={120}>
				<HoverCardTrigger asChild>
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 px-1.5 py-0.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
					>
						<PRIcon state={linkState} className="size-4" />
						<span className="font-mono text-xs text-muted-foreground">
							#{pr.number}
						</span>
						{showIndicators && (
							<PRStatusIndicators
								checks={checks}
								reviewDecision={pr.reviewDecision}
							/>
						)}
					</a>
				</HoverCardTrigger>
				<HoverCardContent
					align="end"
					sideOffset={8}
					className="w-80 overflow-hidden p-0"
				>
					<PRDetailCard pr={pr} checks={checks} linkState={linkState} />
				</HoverCardContent>
			</HoverCard>

			{canMerge && (
				<>
					<div className="h-full w-px bg-border" />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex items-center px-1 py-0.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
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
				</>
			)}
		</div>
	);
}
