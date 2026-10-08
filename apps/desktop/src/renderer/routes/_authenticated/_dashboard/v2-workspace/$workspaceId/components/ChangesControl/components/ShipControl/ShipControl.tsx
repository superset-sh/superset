import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useRef, useState } from "react";
import {
	VscChevronDown,
	VscGitCommit,
	VscGitPullRequestCreate,
	VscLoading,
	VscRepoPush,
} from "react-icons/vsc";
import { useShipActions } from "../../../../hooks/useShipActions";
import type { BranchSyncStatus } from "../../../../utils/getPRFlowState";
import { CommitForm } from "../../../CommitForm";
import { CreatePrForm } from "../../../CreatePrForm";

interface ShipControlProps {
	workspaceId: string;
	sync: BranchSyncStatus;
	onRefresh: () => void;
	/**
	 * True when the diff-stat face is showing next to this segment: the ship
	 * actions collapse into the chevron menu so the control keeps one face.
	 */
	compact?: boolean;
}

/**
 * The no-PR half of the tab-bar Changes control: walks the branch to a pull
 * request. Full mode shows one progressive face — Commit (message popover)
 * while the tree is dirty, then Create PR (title/description popover; pushes
 * first when the branch is unpublished or ahead), then Push. Compact mode
 * (diff stats own the face) folds the same actions into the chevron menu.
 *
 * Session workspaces can't create PRs — the PR route and
 * repo resolution are project-scoped — so they only ever see Commit/Push.
 */
export function ShipControl({
	workspaceId,
	sync,
	onRefresh,
	compact = false,
}: ShipControlProps) {
	const { t } = useLingui();
	const needsCommit = sync.hasUncommitted;
	const needsPush = !sync.hasUpstream || sync.pushCount > 0;

	// Which popover form is open; both anchor to the whole segment so the
	// compact menu items and the full-mode faces share one Popover.
	const [view, setView] = useState<"commit" | "pr" | null>(null);
	// A compact menu item can't open the popover directly: the menu content
	// stays mounted (and keeps reclaiming focus) through its exit animation,
	// so a popover opened on click loses its autofocused field a few
	// milliseconds later and dismisses itself as focus-outside. Items only
	// record the intent; the menu's onCloseAutoFocus — which fires once its
	// focus scope is genuinely torn down — opens the popover and suppresses
	// the focus-return to the chevron (equally focus-outside).
	const pendingViewRef = useRef<"commit" | "pr" | null>(null);
	const actions = useShipActions({
		workspaceId,
		onRefresh,
		isPrFormOpen: view === "pr",
		onCommitted: () => setView(null),
		onPrCreated: () => setView(null),
	});
	const { canCreatePr, hasCommitsAhead, isShipping } = actions;
	const openPrView = () => {
		actions.seedPrTitle();
		setView("pr");
	};

	const showCreatePr = !needsCommit && canCreatePr;
	if (!needsCommit && !showCreatePr && !needsPush) return null;

	const noCommitsTooltip = t({
		message: "No commits to open a pull request from",
	});

	// enabled: on the hover so a disabled button stays hoverable (pointer
	// events are kept alive for the native title tooltip) without lighting up.
	const mainButtonClass =
		"flex h-full items-center gap-1.5 px-2 text-xs font-medium text-foreground outline-none transition-colors enabled:hover:bg-accent/60 disabled:opacity-50";
	const chevronButton = (
		<button
			type="button"
			className="flex h-full items-center px-1 outline-none transition-colors hover:bg-accent/60"
			aria-label={t({
				message: "Open ship options",
			})}
		>
			{isShipping || actions.isCommitting ? (
				<VscLoading className="size-3 animate-spin text-muted-foreground" />
			) : (
				<VscChevronDown className="size-3 text-muted-foreground" />
			)}
		</button>
	);

	return (
		<Popover
			open={view !== null}
			onOpenChange={(open) => {
				if (!open) setView(null);
			}}
		>
			<PopoverAnchor asChild>
				{/* A segment of ChangesControl's split button — the parent owns
				    the border, rounding, and fill. */}
				<div className="flex items-center">
					{compact ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>{chevronButton}</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-44"
								onCloseAutoFocus={(event) => {
									const pending = pendingViewRef.current;
									if (pending) {
										pendingViewRef.current = null;
										event.preventDefault();
										if (pending === "pr") openPrView();
										else setView(pending);
									}
								}}
							>
								{needsCommit && (
									<DropdownMenuItem
										className="text-xs"
										disabled={actions.isCommitting}
										onClick={() => {
											pendingViewRef.current = "commit";
										}}
									>
										<VscGitCommit className="size-3.5" />
										<Trans>Commit</Trans>
									</DropdownMenuItem>
								)}
								{needsPush && (
									<DropdownMenuItem
										className="text-xs"
										disabled={actions.isPushing}
										onClick={actions.push}
									>
										<VscRepoPush className="size-3.5" />
										<Trans>Push</Trans>
									</DropdownMenuItem>
								)}
								{canCreatePr && (
									// Not `disabled` when there are no commits ahead: a disabled
									// menu item is pointer-events-none, so its title tooltip can
									// never show — instead the greyed item stays clickable and
									// explains itself with a toast.
									<DropdownMenuItem
										className={
											hasCommitsAhead
												? "text-xs"
												: "text-xs text-muted-foreground focus:text-muted-foreground"
										}
										disabled={isShipping}
										onClick={() => {
											if (!hasCommitsAhead) {
												toast.info(noCommitsTooltip);
												return;
											}
											pendingViewRef.current = "pr";
										}}
									>
										<VscGitPullRequestCreate className="size-3.5" />
										<Trans>Create PR</Trans>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<>
							{needsCommit ? (
								<button
									type="button"
									className={mainButtonClass}
									onClick={() => setView("commit")}
								>
									{actions.isCommitting ? (
										<VscLoading className="size-3.5 animate-spin" />
									) : (
										<VscGitCommit className="size-3.5" />
									)}
									<Trans>Commit</Trans>
								</button>
							) : showCreatePr ? (
								<button
									type="button"
									className={mainButtonClass}
									disabled={!hasCommitsAhead}
									title={hasCommitsAhead ? undefined : noCommitsTooltip}
									onClick={openPrView}
								>
									{isShipping ? (
										<VscLoading className="size-3.5 animate-spin" />
									) : (
										<VscGitPullRequestCreate className="size-3.5" />
									)}
									<Trans>Create PR</Trans>
								</button>
							) : (
								<button
									type="button"
									className={mainButtonClass}
									disabled={actions.isPushing}
									onClick={actions.push}
								>
									{actions.isPushing ? (
										<VscLoading className="size-3.5 animate-spin" />
									) : (
										<VscRepoPush className="size-3.5" />
									)}
									<Trans>Push</Trans>
								</button>
							)}
							{needsPush && (needsCommit || showCreatePr) && (
								<>
									<div className="h-full w-px bg-border/60" />
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											{chevronButton}
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-40">
											<DropdownMenuItem
												className="text-xs"
												disabled={actions.isPushing}
												onClick={actions.push}
											>
												<VscRepoPush className="size-3.5" />
												<Trans>Push</Trans>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</>
							)}
						</>
					)}
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="end"
				sideOffset={8}
				className={view === "pr" ? "w-96 p-3" : "w-80 p-3"}
			>
				{view === "commit" ? (
					<CommitForm actions={actions} />
				) : (
					<CreatePrForm actions={actions} />
				)}
			</PopoverContent>
		</Popover>
	);
}
