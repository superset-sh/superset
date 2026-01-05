import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { HiMiniLockClosed, HiMiniLockOpen, HiMiniXMark } from "react-icons/hi2";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";

interface PlanViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
	pane: Pane;
	isActive: boolean;
	tabId: string;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function PlanViewerPane({
	paneId,
	path,
	pane,
	isActive,
	tabId,
	removePane,
	setFocusedPane,
}: PlanViewerPaneProps) {
	const planViewer = pane.planViewer;

	if (!planViewer) {
		return (
			<MosaicWindow<string> path={path} title="">
				<div className="flex items-center justify-center h-full text-muted-foreground">
					No plan viewer state
				</div>
			</MosaicWindow>
		);
	}

	const timeAgo = formatDistanceToNow(planViewer.submittedAt, {
		addSuffix: true,
	});
	const isLocked = planViewer.isLocked ?? false;

	const handleFocus = () => {
		setFocusedPane(tabId, paneId);
	};

	const handleClosePane = (e: React.MouseEvent) => {
		e.stopPropagation();
		removePane(paneId);
	};

	const handleToggleLock = () => {
		const panes = useTabsStore.getState().panes;
		const currentPane = panes[paneId];
		if (currentPane?.planViewer) {
			useTabsStore.setState({
				panes: {
					...panes,
					[paneId]: {
						...currentPane,
						planViewer: {
							...currentPane.planViewer,
							isLocked: !currentPane.planViewer.isLocked,
						},
					},
				},
			});
		}
	};

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() => (
				<div className="flex h-full w-full items-center justify-between px-2">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-xs font-medium">{pane.name}</span>
						<Badge variant="secondary" className="text-[10px] h-4 px-1">
							{timeAgo}
						</Badge>
						{planViewer.agentType && (
							<Badge variant="outline" className="text-[10px] h-4 px-1">
								{planViewer.agentType}
							</Badge>
						)}
					</div>
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleToggleLock}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									{isLocked ? (
										<HiMiniLockClosed className="size-3" />
									) : (
										<HiMiniLockOpen className="size-3" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{isLocked
									? "Unlock (allow plan replacement)"
									: "Lock (prevent plan replacement)"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleClosePane}
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
								>
									<HiMiniXMark className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								Close
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			)}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Focus handler */}
			<div
				className="w-full h-full overflow-auto bg-background"
				onClick={handleFocus}
			>
				<div className="p-4">
					<MarkdownRenderer content={planViewer.content} />
				</div>
			</div>
		</MosaicWindow>
	);
}
