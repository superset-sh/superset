import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import {
	VscChevronDown,
	VscGitMerge,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import { computeChecksRollup } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/computeChecksStatus";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import type { PRFlowState } from "../../utils/getPRFlowState";
import { PRDetailCard } from "./components/PRDetailCard";
import { PRStatusIndicators } from "./components/PRStatusIndicators";

interface PRStatusGroupProps {
	state: PRFlowState;
	workspaceId: string;
	onRefresh?: () => void;
	/** Whether a Changes pane is in view — the face reads as pressed. */
	isChangesOpen?: boolean;
	/** Accessible name for the face's toggle ("Open changes" / "Close changes"). */
	toggleLabel?: string;
	/**
	 * Toggles the Changes pane — the badge's main click, since it replaced
	 * the diff-stat pill as the control's face once a PR exists.
	 */
	onToggleChanges?: () => void;
}

/**
 * Top-bar PR badge — status icon + number + compact CI/review indicators,
 * with a dropdown for merge actions (open, non-draft PRs), marking a draft
 * ready for review, the in-app PR view, and a GitHub link.
 * Clicking the badge toggles the Changes pane; the in-app PR view lives in
 * the menu (hidden for session workspaces — null projectId — since the PR route
 * is project-scoped). Hovering surfaces a rich detail popover (title,
 * branch, CI summary, last activity).
 *
 * Indicators are suppressed past `open`/`queued` since post-merge CI/review
 * state is historical noise.
 */
export function PRStatusGroup({
	state,
	workspaceId,
	onRefresh,
	isChangesOpen = false,
	toggleLabel,
	onToggleChanges,
}: PRStatusGroupProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { workspace } = useWorkspace();
	const projectId = workspace.projectId;
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
			const toastId = toast.loading(t({ message: "Merging PR..." }));
			return { toastId };
		},
		onSuccess: async (_data, _variables, context) => {
			toast.success(t({ message: "PR merged" }), { id: context?.toastId });
			try {
				await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
			} catch (error) {
				console.warn("Failed to refresh PR state after merge", error);
				toast.warning(
					t({
						message:
							"Merged, but couldn't refresh PR state — try again in a moment",
					}),
				);
			} finally {
				onRefresh?.();
			}
		},
		onError: (error, _variables, context) => {
			toast.error(
				t({
					message: `Merge failed: ${error.message}`,
				}),
				{ id: context?.toastId },
			);
		},
	});

	const markReadyMutation =
		workspaceTrpc.github.markPullRequestReady.useMutation({
			onMutate: () => {
				const toastId = toast.loading(
					t({
						message: "Marking ready for review...",
					}),
				);
				return { toastId };
			},
			onSuccess: async (_data, _variables, context) => {
				toast.success(
					t({
						message: "PR ready for review",
					}),
					{ id: context?.toastId },
				);
				try {
					await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
				} catch (error) {
					console.warn("Failed to refresh PR state after marking ready", error);
					toast.warning(
						t({
							message:
								"Marked ready, but couldn't refresh PR state — try again in a moment",
						}),
					);
				} finally {
					onRefresh?.();
				}
			},
			onError: (error, _variables, context) => {
				toast.error(
					t({
						message: `Ready for review failed: ${error.message}`,
					}),
					{ id: context?.toastId },
				);
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
				: pr.state === "queued"
					? "queued"
					: "open";
	const canMerge = pr.state === "open" && !pr.isDraft;
	// A closed/merged draft can't transition to ready — GitHub rejects it.
	const canMarkReady =
		linkState === "draft" && pr.state !== "closed" && pr.state !== "merged";
	// Queued PRs are still actively running checks, so keep CI/review indicators.
	const showIndicators = pr.state === "open" || pr.state === "queued";

	const handleMerge = (mergeMethod: "merge" | "squash" | "rebase") => {
		mergePRMutation.mutate({
			owner: pr.repoOwner,
			repo: pr.repoName,
			pullNumber: pr.number,
			mergeMethod,
		});
	};

	const tint = stateTintClasses(linkState);

	const badgeContent = (
		<>
			<PRIcon state={linkState} className="size-4" />
			{/* The number brightens while pressed — the state tint alone moves
			    the fill too little to read as a toggle. */}
			<span
				className={cn(
					"font-mono text-xs",
					isChangesOpen ? "text-foreground" : "text-muted-foreground",
				)}
			>
				#{pr.number}
			</span>
			{showIndicators && <PRStatusIndicators checks={checks} />}
		</>
	);
	const badgeClass = cn(
		"flex h-full items-center gap-1 px-1.5 outline-none transition-colors",
		tint.hover,
		isChangesOpen && tint.pressed,
	);

	return (
		// A segment of ChangesControl's split button — the parent owns the
		// border and rounding; the state tint lives in this segment's fill.
		<div
			className={cn("flex items-center", tint.container)}
			aria-busy={mergePRMutation.isPending || markReadyMutation.isPending}
		>
			<HoverCard openDelay={150} closeDelay={120}>
				<HoverCardTrigger asChild>
					{/* The face toggles the Changes pane — the badge replaced the
					    diff-stat pill, so its click keeps that pill's job; the PR
					    view is one menu entry (or the hover card) away. */}
					{onToggleChanges != null ? (
						<button
							type="button"
							className={badgeClass}
							aria-pressed={isChangesOpen}
							// The visible text is only the PR number; name the action
							// and keep the number so the badge is still identifiable.
							aria-label={
								toggleLabel ? `${toggleLabel}, #${pr.number}` : undefined
							}
							onClick={onToggleChanges}
						>
							{badgeContent}
						</button>
					) : (
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className={badgeClass}
						>
							{badgeContent}
						</a>
					)}
				</HoverCardTrigger>
				<HoverCardContent
					align="end"
					sideOffset={8}
					className="w-80 overflow-hidden p-0"
				>
					<PRDetailCard pr={pr} checks={checks} linkState={linkState} />
				</HoverCardContent>
			</HoverCard>

			<div className={cn("h-full w-px", tint.divider)} />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={cn(
							"flex h-full items-center px-1 outline-none transition-colors",
							tint.hover,
						)}
						disabled={mergePRMutation.isPending || markReadyMutation.isPending}
						aria-label={
							mergePRMutation.isPending
								? t({
										message: "Merging pull request",
									})
								: t({
										message: "Open pull request options",
									})
						}
					>
						{mergePRMutation.isPending || markReadyMutation.isPending ? (
							<VscLoading className="size-3 animate-spin text-muted-foreground" />
						) : (
							<VscChevronDown className="size-3 text-muted-foreground" />
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					{canMarkReady && (
						<>
							<DropdownMenuItem
								className="text-xs"
								disabled={markReadyMutation.isPending}
								onClick={() =>
									markReadyMutation.mutate({
										owner: pr.repoOwner,
										repo: pr.repoName,
										pullNumber: pr.number,
									})
								}
							>
								<VscGitPullRequest className="size-3.5" />
								<Trans>Ready for review</Trans>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{canMerge && (
						<>
							<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
								<Trans>Merge</Trans>
							</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => handleMerge("squash")}
								className="text-xs"
								disabled={mergePRMutation.isPending}
							>
								<VscGitMerge className="size-3.5" />
								<Trans>Squash and merge</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleMerge("merge")}
								className="text-xs"
								disabled={mergePRMutation.isPending}
							>
								<VscGitMerge className="size-3.5" />
								<Trans>Create merge commit</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleMerge("rebase")}
								className="text-xs"
								disabled={mergePRMutation.isPending}
							>
								<VscGitMerge className="size-3.5" />
								<Trans>Rebase and merge</Trans>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{projectId != null && (
						<DropdownMenuItem
							className="text-xs"
							onClick={() => {
								// Same pair the PR list's own row click performs — the detail
								// pane may have been collapsed the last time the view was open.
								usePullRequestsSplitViewStore.getState().expandDetail();
								void navigate({
									to: "/pull-requests/$prNumber",
									params: { prNumber: String(pr.number) },
									search: { project: projectId },
								});
							}}
						>
							<VscGitPullRequest className="size-3.5" />
							<Trans>Open pull request</Trans>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem asChild className="text-xs">
						<a href={pr.url} target="_blank" rel="noopener noreferrer">
							<LuArrowUpRight className="size-3.5" />
							<Trans>View on GitHub</Trans>
						</a>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

/**
 * State-tinted styling for the PR badge segment. Mirrors the PRIcon color
 * palette so the whole segment reads as "open"/"draft"/etc. at a glance,
 * not just the icon.
 */
function stateTintClasses(state: PRState): {
	container: string;
	hover: string;
	/** Face fill while the Changes pane it toggles is in view. */
	pressed: string;
	divider: string;
} {
	switch (state) {
		case "open":
			return {
				container: "bg-emerald-500/10",
				hover: "hover:bg-emerald-500/15 focus-visible:bg-emerald-500/15",
				pressed: "bg-emerald-500/20",
				divider: "bg-emerald-500/30",
			};
		case "merged":
			return {
				container: "bg-violet-500/10",
				hover: "hover:bg-violet-500/15 focus-visible:bg-violet-500/15",
				pressed: "bg-violet-500/20",
				divider: "bg-violet-500/30",
			};
		case "closed":
			return {
				container: "bg-rose-500/10",
				hover: "hover:bg-rose-500/15 focus-visible:bg-rose-500/15",
				pressed: "bg-rose-500/20",
				divider: "bg-rose-500/30",
			};
		case "draft":
			return {
				container: "bg-muted/40",
				hover: "hover:bg-muted/60 focus-visible:bg-muted/60",
				pressed: "bg-muted/70",
				divider: "bg-border",
			};
		case "queued":
			return {
				container: "bg-amber-500/10",
				hover: "hover:bg-amber-500/15 focus-visible:bg-amber-500/15",
				pressed: "bg-amber-500/20",
				divider: "bg-amber-500/30",
			};
	}
}
