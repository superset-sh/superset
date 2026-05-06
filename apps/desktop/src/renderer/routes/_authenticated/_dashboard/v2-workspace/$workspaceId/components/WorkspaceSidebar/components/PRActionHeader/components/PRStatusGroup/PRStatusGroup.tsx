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
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { VscChevronDown, VscGitMerge, VscLoading } from "react-icons/vsc";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
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
			} catch (error) {
				console.warn("Failed to refresh PR state after merge", error);
				toast.warning(
					"Merged, but couldn't refresh PR state — try again in a moment",
				);
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

	const tint = stateTintClasses(linkState);

	return (
		<div
			className={cn(
				"flex items-center overflow-hidden rounded border",
				tint.container,
			)}
			aria-busy={mergePRMutation.isPending}
		>
			<HoverCard openDelay={150} closeDelay={120}>
				<HoverCardTrigger asChild>
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						className={cn(
							"flex items-center gap-1 px-1.5 py-0.5 outline-none transition-colors",
							tint.hover,
						)}
					>
						<PRIcon state={linkState} className="size-4" />
						<span className="font-mono text-xs text-muted-foreground">
							#{pr.number}
						</span>
						{showIndicators && <PRStatusIndicators checks={checks} />}
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
					<div className={cn("h-full w-px", tint.divider)} />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									"flex items-center px-1 py-0.5 outline-none transition-colors",
									tint.hover,
								)}
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

/**
 * State-tinted styling for the PR badge bordered group. Mirrors the PRIcon
 * color palette so the whole group reads as "open"/"draft"/etc. at a glance,
 * not just the icon.
 */
function stateTintClasses(state: PRState): {
	container: string;
	hover: string;
	divider: string;
} {
	switch (state) {
		case "open":
			return {
				container: "border-emerald-500/30 bg-emerald-500/10",
				hover: "hover:bg-emerald-500/15 focus-visible:bg-emerald-500/15",
				divider: "bg-emerald-500/30",
			};
		case "merged":
			return {
				container: "border-violet-500/30 bg-violet-500/10",
				hover: "hover:bg-violet-500/15 focus-visible:bg-violet-500/15",
				divider: "bg-violet-500/30",
			};
		case "closed":
			return {
				container: "border-rose-500/30 bg-rose-500/10",
				hover: "hover:bg-rose-500/15 focus-visible:bg-rose-500/15",
				divider: "bg-rose-500/30",
			};
		case "draft":
			return {
				container: "border-border bg-muted/40",
				hover: "hover:bg-muted/60 focus-visible:bg-muted/60",
				divider: "bg-border",
			};
	}
}
