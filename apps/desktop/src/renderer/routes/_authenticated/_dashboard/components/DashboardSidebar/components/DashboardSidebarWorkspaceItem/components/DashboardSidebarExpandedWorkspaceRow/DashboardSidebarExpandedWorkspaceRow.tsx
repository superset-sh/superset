import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useEffect,
	useRef,
} from "react";
import { HiMiniMinus, HiMiniXMark } from "react-icons/hi2";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { HotkeyLabel } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspacePullRequest,
} from "../../../../types";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";

const PR_STATE_LABEL: Record<
	DashboardSidebarWorkspacePullRequest["state"],
	string
> = {
	open: "Open",
	merged: "Merged",
	closed: "Closed",
	draft: "Draft",
	queued: "Queued",
};

/**
 * Deterministic dot color for the status-mode repo chip. Derived from the
 * project id so a repo keeps the same hue across rows and sessions.
 */
function repoChipDotColor(seed: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue} 55% 55%)`;
}

interface DashboardSidebarExpandedWorkspaceRowProps
	extends ComponentPropsWithoutRef<"div"> {
	workspace: DashboardSidebarWorkspace;
	isActive: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	diffStats: DiffStats | null;
	workspaceStatus?: ActivePaneStatus | null;
	isInSection?: boolean;
	onClick?: () => void;
	onDoubleClick?: () => void;
	onCloseWorkspaceClick: () => void;
	onRemoveFromSidebarClick: () => void;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
}

export const DashboardSidebarExpandedWorkspaceRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarExpandedWorkspaceRowProps
>(
	(
		{
			workspace,
			isActive,
			isRenaming,
			renameValue,
			shortcutLabel,
			diffStats,
			workspaceStatus = null,
			isInSection = false,
			onClick,
			onDoubleClick,
			onCloseWorkspaceClick,
			onRemoveFromSidebarClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			children,
			...props
		},
		ref,
	) => {
		const {
			accentColor = null,
			hostType,
			hostIsOnline,
			name,
			branch,
			pullRequest,
			pendingTransaction,
			repoLabel,
			projectId,
		} = workspace;
		// `repoLabel` is only populated when building status-grouped rows, so its
		// presence alone means "we're in status mode and should show the repo."
		const showRepoChip = !!repoLabel;
		const isPending = pendingTransaction?.type === "insert";
		const showsStandaloneActiveStripe = accentColor == null;
		const localRef = useRef<HTMLDivElement>(null);
		const openUrl = electronTrpc.external.openUrl.useMutation();

		useEffect(() => {
			if (isActive) {
				localRef.current?.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}, [isActive]);

		const creationStatusText = isPending ? "Creating…" : null;
		const isMainWorkspace = workspace.type === "main";
		const workspaceKindTitle = isMainWorkspace
			? "Main workspace"
			: "Worktree workspace";
		const workspaceKindDescription = isMainWorkspace
			? "Uses the repository checkout on this host"
			: "Isolated copy for parallel development";

		return (
			<div
				ref={(node) => {
					localRef.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
				}}
				className={cn(
					"relative w-full text-left text-sm",
					isActive && "bg-muted",
					onClick && (isActive ? "hover:bg-muted" : "hover:bg-muted/50"),
					className,
				)}
				{...props}
			>
				{isActive && showsStandaloneActiveStripe && (
					<div
						className="absolute top-0 bottom-0 left-0 w-0.5 rounded-r"
						style={{ backgroundColor: "var(--color-foreground)" }}
					/>
				)}

				{/* biome-ignore lint/a11y/noStaticElementInteractions: Mirrors the legacy sidebar row UI, which includes nested action buttons. */}
				<div
					role={onClick ? "button" : undefined}
					tabIndex={onClick ? 0 : undefined}
					aria-disabled={isPending ? true : undefined}
					onClick={onClick}
					onKeyDown={(event) => {
						if (onClick && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							onClick();
						}
					}}
					onDoubleClick={onDoubleClick}
					className={cn(
						"group relative flex w-full items-center py-2 pr-2",
						isInSection ? "pl-7" : "pl-5",
						onClick && "cursor-pointer",
					)}
				>
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							{pullRequest ? (
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										openUrl.mutate(pullRequest.url);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.stopPropagation();
										}
									}}
									aria-label={`Open pull request #${pullRequest.number}`}
									className="relative mr-2.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-foreground/10"
								>
									<DashboardSidebarWorkspaceIcon
										hostType={hostType}
										workspaceType={workspace.type}
										hostIsOnline={hostIsOnline}
										isActive={isActive}
										variant="expanded"
										workspaceStatus={workspaceStatus}
										isCreatePending={isPending}
										pullRequestState={pullRequest.state}
									/>
								</button>
							) : (
								<div className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
									<DashboardSidebarWorkspaceIcon
										hostType={hostType}
										workspaceType={workspace.type}
										hostIsOnline={hostIsOnline}
										isActive={isActive}
										variant="expanded"
										workspaceStatus={workspaceStatus}
										isCreatePending={isPending}
										pullRequestState={null}
									/>
								</div>
							)}
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							{pullRequest ? (
								<>
									<p className="text-xs font-medium">
										PR #{pullRequest.number} —{" "}
										{PR_STATE_LABEL[pullRequest.state]}
									</p>
									<p className="text-xs text-muted-foreground">
										Click to open on GitHub
									</p>
								</>
							) : (
								<>
									<p className="text-xs font-medium">
										{isMainWorkspace
											? workspaceKindTitle
											: hostType === "local-device"
												? "Local workspace"
												: hostType === "remote-device"
													? hostIsOnline === false
														? "Remote workspace — device offline"
														: "Remote workspace"
													: "Cloud workspace"}
									</p>
									<p className="text-xs text-muted-foreground">
										{isMainWorkspace
											? workspaceKindDescription
											: hostType === "local-device"
												? "Running on this device"
												: hostType === "remote-device"
													? hostIsOnline === false
														? "The associated device isn't reachable right now"
														: "Running on a paired device"
													: "Hosted in the cloud"}
									</p>
								</>
							)}
						</TooltipContent>
					</Tooltip>

					<div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
						{isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={onRenameValueChange}
								onSubmit={onSubmitRename}
								onCancel={onCancelRename}
								className={cn(
									"h-5 w-full -ml-1 border-none bg-transparent px-1 py-0 text-[13px] leading-tight outline-none",
								)}
							/>
						) : (
							<div className="flex min-w-0 items-center gap-1.5">
								<span
									className={cn(
										"truncate text-[13px] leading-tight transition-colors",
										isActive ? "text-foreground" : "text-foreground/80",
									)}
								>
									{name || branch}
								</span>
								{showRepoChip && (
									<span
										className="flex shrink-0 items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5"
										title={repoLabel ?? undefined}
									>
										<span
											className="size-1.5 shrink-0 rounded-full"
											style={{ backgroundColor: repoChipDotColor(projectId) }}
										/>
										<span className="max-w-[84px] truncate text-[10px] leading-none text-muted-foreground">
											{repoLabel}
										</span>
									</span>
								)}
							</div>
						)}

						<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
							{creationStatusText ? (
								<span className="text-[11px] text-muted-foreground">
									{creationStatusText}
								</span>
							) : (
								diffStats &&
								(diffStats.additions > 0 || diffStats.deletions > 0) && (
									<DashboardSidebarWorkspaceDiffStats
										additions={diffStats.additions}
										deletions={diffStats.deletions}
										isActive={isActive}
									/>
								)
							)}
							{!isPending && (
								<div className="hidden items-center justify-end gap-1.5 group-hover:flex">
									{shortcutLabel && (
										<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
											{shortcutLabel}
										</span>
									)}
									{isMainWorkspace ? (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onRemoveFromSidebarClick();
													}}
													onKeyDown={(event) => {
														if (
															event.key === "Enter" ||
															event.key === " " ||
															event.key === "Spacebar"
														) {
															event.stopPropagation();
														}
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label="Remove from sidebar"
												>
													<HiMiniMinus className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												<HotkeyLabel label="Remove from sidebar" />
											</TooltipContent>
										</Tooltip>
									) : (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onCloseWorkspaceClick();
													}}
													onKeyDown={(event) => {
														if (
															event.key === "Enter" ||
															event.key === " " ||
															event.key === "Spacebar"
														) {
															event.stopPropagation();
														}
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label="Close workspace"
												>
													<HiMiniXMark className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												<HotkeyLabel
													label="Close workspace"
													id={isActive ? "CLOSE_WORKSPACE" : undefined}
												/>
											</TooltipContent>
										</Tooltip>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
				{children}
			</div>
		);
	},
);
