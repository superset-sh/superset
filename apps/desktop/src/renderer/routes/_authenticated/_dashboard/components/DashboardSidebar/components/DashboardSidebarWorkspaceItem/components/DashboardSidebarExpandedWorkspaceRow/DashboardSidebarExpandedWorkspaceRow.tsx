import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type KeyboardEventHandler,
	type MouseEventHandler,
	useEffect,
	useRef,
} from "react";
import { HiCheck, HiMiniMinus, HiMiniXMark } from "react-icons/hi2";
import { WorkspaceNameMarquee } from "renderer/components/WorkspaceNameMarquee";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { useFocusVisible } from "renderer/hooks/useFocusVisible";
import { HotkeyLabel } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspaceIndentation,
	DashboardSidebarWorkspacePullRequest,
} from "../../../../types";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";
import { DashboardSidebarWorkspaceChips } from "./components/DashboardSidebarWorkspaceChips";

const PR_STATE_LABEL: Record<
	DashboardSidebarWorkspacePullRequest["state"],
	MessageDescriptor
> = {
	open: msg({
		message: "Open",
		context: "status",
	}),
	merged: msg({
		message: "Merged",
	}),
	closed: msg({
		message: "Closed",
	}),
	draft: msg({
		message: "Draft",
	}),
	queued: msg({
		message: "Queued",
	}),
};

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
	indentation?: DashboardSidebarWorkspaceIndentation;
	isBulkSelectable?: boolean;
	isSelected?: boolean;
	/** Present when rendered in the Pinned section: shows the project avatar. */
	/** projectName is null for pinned project-less "session" workspaces. */
	pinnedContext?: { projectName: string | null; projectIconUrl: string | null };
	onClick?: MouseEventHandler<HTMLDivElement>;
	onKeyboardActivate?: KeyboardEventHandler<HTMLDivElement>;
	onWorkspaceChipsClick?: MouseEventHandler<HTMLDivElement>;
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
			indentation,
			isBulkSelectable = false,
			isSelected = false,
			pinnedContext,
			onClick,
			onKeyboardActivate,
			onWorkspaceChipsClick,
			onDoubleClick,
			onCloseWorkspaceClick,
			onRemoveFromSidebarClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			...props
		},
		ref,
	) => {
		const { t } = useLingui();
		const resolvedIndentation =
			indentation ?? (isInSection ? "grouped" : "workspace");
		const {
			hostType,
			hostIsOnline,
			name,
			branch,
			pullRequest,
			pendingTransaction,
		} = workspace;
		const isPending = pendingTransaction?.type === "insert";
		const localRef = useRef<HTMLDivElement>(null);
		const openUrl = electronTrpc.external.openUrl.useMutation();
		// Drives the name's hover-reveal for keyboard users: the row, not the
		// name span, is what's actually tabbable.
		const {
			isFocusVisible: isFocused,
			onFocus: handleRowFocus,
			onBlur: handleRowBlur,
		} = useFocusVisible();

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
		// No hover action button on the local main workspace: a stray click on the
		// minus would remove the project's anchor row. Removal stays available via
		// the context menu.
		const isLocalMainWorkspace = isMainWorkspace && hostType === "local-device";
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
					"relative mx-2 rounded-md text-left text-sm transition-colors",
					isActive && "bg-fill-selected",
					isSelected && "bg-fill-selected",
					onClick &&
						(isSelected
							? "hover:bg-fill-selected"
							: isActive
								? "hover:bg-fill-selected"
								: "hover:bg-fill-hover"),
					className,
				)}
				data-selected={isSelected || undefined}
				{...props}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: The row contains nested action buttons, so it cannot be a native button. */}
				<div
					role="button"
					tabIndex={0}
					aria-disabled={isPending ? true : undefined}
					aria-pressed={isBulkSelectable ? isSelected : undefined}
					onClick={onClick}
					onKeyDown={(event) => {
						if (onClick && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							event.stopPropagation();
							onKeyboardActivate?.(event);
						}
					}}
					onDoubleClick={onDoubleClick}
					onFocus={handleRowFocus}
					onBlur={handleRowBlur}
					className={cn(
						"group relative flex h-7 w-full items-center pr-2",
						resolvedIndentation === "top-level"
							? "pl-2"
							: resolvedIndentation === "grouped"
								? "pl-10"
								: "pl-6",
						onClick && "cursor-pointer",
					)}
				>
					{isSelected ? (
						<span className="mr-2 flex size-4 shrink-0 items-center justify-center text-foreground">
							<HiCheck className="size-3.5" />
						</span>
					) : (
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
										aria-label={t({
											message: `Open pull request #${pullRequest.number}`,
										})}
										className="relative mr-2 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-foreground/10"
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
									<div className="relative mr-2 flex size-4 shrink-0 items-center justify-center">
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
											<Trans>
												PR #{pullRequest.number} —{" "}
												{i18n._(PR_STATE_LABEL[pullRequest.state])}
											</Trans>
										</p>
										<p className="text-xs text-muted-foreground">
											<Trans>Click to open on GitHub</Trans>
										</p>
									</>
								) : (
									<>
										<p className="text-xs font-medium">
											{isMainWorkspace ? (
												workspaceKindTitle
											) : hostType === "local-device" ? (
												<Trans>Local workspace</Trans>
											) : hostType === "remote-device" ? (
												hostIsOnline === false ? (
													<Trans>Remote workspace — device offline</Trans>
												) : (
													<Trans>Remote workspace</Trans>
												)
											) : (
												<Trans>Cloud workspace</Trans>
											)}
										</p>
										<p className="text-xs text-muted-foreground">
											{isMainWorkspace ? (
												workspaceKindDescription
											) : hostType === "local-device" ? (
												<Trans>Running on this device</Trans>
											) : hostType === "remote-device" ? (
												hostIsOnline === false ? (
													<Trans>
														The associated device isn't reachable right now
													</Trans>
												) : (
													<Trans>Running on a paired device</Trans>
												)
											) : (
												<Trans>Hosted in the cloud</Trans>
											)}
										</p>
									</>
								)}
							</TooltipContent>
						</Tooltip>
					)}

					{pinnedContext && (
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<div className="mr-1.5 flex shrink-0 items-center">
									<ProjectThumbnail
										projectName={
											pinnedContext.projectName ??
											t({
												message: "Session",
											})
										}
										iconUrl={pinnedContext.projectIconUrl}
										className="size-3.5 text-[8px]"
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{pinnedContext.projectName ??
									t({
										message: "Session",
									})}
							</TooltipContent>
						</Tooltip>
					)}

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
							<>
								<WorkspaceNameMarquee
									name={name || branch}
									forceActive={isFocused}
									className={cn(
										"text-[13px] leading-tight transition-colors",
										isActive || isSelected
											? "text-foreground"
											: "text-foreground/80",
									)}
								/>
								{isSelected && (
									<span className="sr-only">
										<Trans>, selected</Trans>
									</span>
								)}
							</>
						)}

						<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
							{creationStatusText ? (
								<span className="text-[11px] text-muted-foreground">
									{creationStatusText}
								</span>
							) : (
								isActive &&
								diffStats &&
								(diffStats.additions > 0 || diffStats.deletions > 0) && (
									<DashboardSidebarWorkspaceDiffStats
										additions={diffStats.additions}
										deletions={diffStats.deletions}
										isActive={isActive}
									/>
								)
							)}
							{!isPending && !isSelected && (
								<div className="hidden items-center justify-end gap-1.5 group-hover:flex group-focus-within:flex">
									{shortcutLabel && (
										<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
											{shortcutLabel}
										</span>
									)}
									{isLocalMainWorkspace ? null : isMainWorkspace ? (
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
													aria-label={t({
														message: "Remove from sidebar",
													})}
												>
													<HiMiniMinus className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top">
												<HotkeyLabel
													label={t({
														message: "Remove from sidebar",
													})}
												/>
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
													aria-label={t({
														message: "Close workspace",
													})}
												>
													<HiMiniXMark className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top">
												<HotkeyLabel
													label={t({
														message: "Close workspace",
													})}
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
				{!isPending && (
					<DashboardSidebarWorkspaceChips
						workspaceId={workspace.id}
						isInSection={isInSection}
						indentation={resolvedIndentation}
						onClick={onWorkspaceChipsClick}
					/>
				)}
			</div>
		);
	},
);
