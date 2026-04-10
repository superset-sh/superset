import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { HiMiniXMark } from "react-icons/hi2";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { HotkeyLabel } from "renderer/hotkeys";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { DashboardSidebarWorkspace } from "../../../../types";
import { getCreationStatusText } from "../../utils/getCreationStatusText";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";
import { DashboardSidebarWorkspaceStatusBadge } from "../DashboardSidebarWorkspaceStatusBadge";

interface DashboardSidebarExpandedWorkspaceRowProps
	extends ComponentPropsWithoutRef<"div"> {
	workspace: DashboardSidebarWorkspace;
	isActive: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	diffStats: DiffStats | null;
	onClick?: () => void;
	onDoubleClick?: () => void;
	onDeleteClick: () => void;
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
			onClick,
			onDoubleClick,
			onDeleteClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			...props
		},
		ref,
	) => {
		const {
			accentColor = null,
			hostType,
			name,
			branch,
			pullRequest,
			creationStatus,
		} = workspace;
		const showsStandaloneActiveStripe = accentColor == null;
		const localRef = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (isActive) {
				localRef.current?.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}, [isActive]);

		const creationStatusText = useMemo(
			() => getCreationStatusText(creationStatus),
			[creationStatus],
		);

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: Mirrors the legacy sidebar row UI, which includes nested action buttons.
			<div
				role={onClick ? "button" : undefined}
				tabIndex={onClick ? 0 : undefined}
				aria-disabled={creationStatus ? true : undefined}
				ref={(node) => {
					localRef.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
				}}
				onClick={onClick}
				onKeyDown={(event) => {
					if (onClick && (event.key === "Enter" || event.key === " ")) {
						event.preventDefault();
						onClick();
					}
				}}
				onDoubleClick={onDoubleClick}
				className={cn(
					"relative flex w-full items-center pl-3 pr-2 text-left text-sm",
					onClick && "cursor-pointer hover:bg-muted/50",
					"group",
					"py-1.5",
					isActive && "bg-muted",
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

				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<div className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
							<DashboardSidebarWorkspaceIcon
								hostType={hostType}
								isActive={isActive}
								variant="expanded"
								workspaceStatus={null}
								creationStatus={creationStatus}
							/>
						</div>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						<p className="text-xs font-medium">Worktree workspace</p>
						<p className="text-xs text-muted-foreground">
							Isolated copy for parallel development
						</p>
					</TooltipContent>
				</Tooltip>

				<div className="flex min-w-0 flex-1 flex-col justify-center">
					<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-2 items-center gap-x-1.5 gap-y-0.5">
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
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors",
									isActive ? "text-foreground" : "text-foreground/80",
								)}
							>
								{name || branch}
							</span>
						)}

						<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center [&>*]:col-start-1 [&>*]:row-start-1">
							{creationStatusText ? (
								<span
									className={cn(
										"text-[11px]",
										creationStatus === "failed"
											? "text-destructive"
											: "text-muted-foreground",
									)}
								>
									{creationStatusText}
								</span>
							) : (
								<>
									{diffStats && (
										<DashboardSidebarWorkspaceDiffStats
											additions={diffStats.additions}
											deletions={diffStats.deletions}
											isActive={isActive}
										/>
									)}
									<div className="invisible flex items-center justify-end gap-1.5 opacity-0 transition-[opacity,visibility] group-hover:visible group-hover:opacity-100">
										{shortcutLabel && (
											<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
												{shortcutLabel}
											</span>
										)}
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onDeleteClick();
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
									</div>
								</>
							)}
						</div>

						<span className="col-start-1 row-start-2 truncate font-mono text-[11px] leading-tight text-muted-foreground/60">
							{branch}
						</span>

						{pullRequest && (
							<DashboardSidebarWorkspaceStatusBadge
								state={pullRequest.state}
								prNumber={pullRequest.number}
								prUrl={pullRequest.url}
								className="col-start-2 row-start-2 justify-self-end"
							/>
						)}
					</div>
				</div>
			</div>
		);
	},
);
