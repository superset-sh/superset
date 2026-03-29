import { useCallback, useEffect, useRef } from "react";
import { LuMessageSquare } from "react-icons/lu";
import type { MosaicBranch } from "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ReviewCommentGroup } from "./components/ReviewCommentGroup";
import { ReviewToolbar } from "./components/ReviewToolbar";
import { useReviewActions } from "./hooks/useReviewActions";
import { groupComments } from "./utils/groupComments";

interface ReviewPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
	onSendToAgent?: (text: string) => void;
}

export function ReviewPane({
	paneId,
	path,
	tabId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
	onSendToAgent,
}: ReviewPaneProps) {
	const reviewData = useTabsStore((s) => s.panes[paneId]?.review);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const comments = reviewData?.comments ?? [];
	const highlightCommentId = reviewData?.highlightCommentId;
	const prTitle = reviewData?.prTitle ?? "Pull Request Review";
	const prNumber = reviewData?.prNumber;
	const githubUrl = reviewData?.prUrl;

	const { handleCopyAll, handleSendToAgent, copiedAll } = useReviewActions({
		comments,
		onSendToAgent,
	});

	const handleOpenInGitHub = useCallback(() => {
		if (githubUrl) {
			window.open(githubUrl, "_blank");
		}
	}, [githubUrl]);

	// Auto-scroll to highlighted comment on mount or when it changes
	useEffect(() => {
		if (!highlightCommentId || !scrollContainerRef.current) {
			return;
		}

		const timeoutId = setTimeout(() => {
			const highlightedElement = scrollContainerRef.current?.querySelector(
				`[data-comment-id="${highlightCommentId}"]`,
			);
			if (highlightedElement) {
				highlightedElement.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
			}
		}, 150);

		return () => clearTimeout(timeoutId);
	}, [highlightCommentId]);

	const commentGroups = groupComments(comments);

	if (!reviewData) {
		return (
			<BasePaneWindow
				paneId={paneId}
				path={path}
				tabId={tabId}
				splitPaneAuto={splitPaneAuto}
				removePane={removePane}
				setFocusedPane={setFocusedPane}
				renderToolbar={() => <div className="h-full w-full" />}
			>
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					No review data
				</div>
			</BasePaneWindow>
		);
	}

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			contentClassName="w-full h-full overflow-hidden"
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between border-b px-3">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<LuMessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate text-sm font-medium">{prTitle}</span>
						{prNumber ? (
							<span className="shrink-0 text-xs text-muted-foreground">
								#{prNumber}
							</span>
						) : null}
					</div>
					<div className="flex items-center gap-1">
						<ReviewToolbar
							onCopyAll={copiedAll ? undefined : handleCopyAll}
							onSendToAgent={onSendToAgent ? handleSendToAgent : undefined}
							onOpenInGitHub={handleOpenInGitHub}
							githubUrl={githubUrl}
						/>
						<div className="mx-1 h-4 w-px bg-border" />
						<PaneToolbarActions
							splitOrientation={handlers.splitOrientation}
							onSplitPane={handlers.onSplitPane}
							onClosePane={handlers.onClosePane}
							closeHotkeyId="CLOSE_TERMINAL"
						/>
					</div>
				</div>
			)}
		>
			<div ref={scrollContainerRef} className="h-full overflow-y-auto">
				{commentGroups.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
						<LuMessageSquare className="size-8 opacity-50" />
						<p className="text-sm">No review comments</p>
					</div>
				) : (
					<div className="flex flex-col">
						{commentGroups.map((group) => (
							<ReviewCommentGroup
								key={group.path ?? "general"}
								group={group}
								highlightCommentId={highlightCommentId}
							/>
						))}
					</div>
				)}
			</div>
		</BasePaneWindow>
	);
}
