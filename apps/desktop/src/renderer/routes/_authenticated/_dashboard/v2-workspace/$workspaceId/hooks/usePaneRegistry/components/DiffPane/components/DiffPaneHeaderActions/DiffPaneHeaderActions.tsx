import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuChevronDown, LuChevronUp, LuMessageSquare } from "react-icons/lu";
import {
	DiffTreeToggleButton,
	type DiffViewToolbarCommentNav,
	type DiffViewToolbarTreeToggle,
} from "renderer/screens/main/components/DiffViewToolbar";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../../../types";
import { DiffPaneMoreMenu } from "../DiffPaneMoreMenu";
import { DiffPanePRLink } from "../DiffPanePRLink";

interface DiffPaneHeaderActionsProps {
	/** Without the right pane area the top-bar PR badge toggles Changes, so the pane links the PR itself. */
	prLink?: {
		workspaceId: string;
		store: StoreApi<WorkspaceStore<PaneViewerData>>;
	};
	commentNav: DiffViewToolbarCommentNav;
	/** Only when the pane carries its own file list. */
	files?: DiffViewToolbarTreeToggle;
	areAllFilesCollapsed: boolean;
	onToggleCollapseAll: () => void;
}

/** The Changes pane header's right side, before the pane's own actions. */
export function DiffPaneHeaderActions({
	prLink,
	commentNav,
	files,
	areAllFilesCollapsed,
	onToggleCollapseAll,
}: DiffPaneHeaderActionsProps) {
	const { t } = useLingui();
	return (
		<div className="flex shrink-0 items-center gap-1">
			{prLink && (
				<DiffPanePRLink workspaceId={prLink.workspaceId} store={prLink.store} />
			)}
			{commentNav.total > 0 && (
				<div className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 px-1">
					<LuMessageSquare
						aria-hidden="true"
						className="size-3 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="min-w-[3ch] text-center text-[11px] tabular-nums text-muted-foreground">
						{commentNav.focusedIndex != null
							? commentNav.focusedIndex + 1
							: "–"}
						/{commentNav.total}
					</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={commentNav.onPrev}
								aria-label={t({ message: "Previous comment" })}
								className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
							>
								<LuChevronUp className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>Previous comment</Trans>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={commentNav.onNext}
								aria-label={t({ message: "Next comment" })}
								className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
							>
								<LuChevronDown className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>Next comment</Trans>
						</TooltipContent>
					</Tooltip>
				</div>
			)}
			<DiffPaneMoreMenu
				areAllFilesCollapsed={areAllFilesCollapsed}
				onToggleCollapseAll={onToggleCollapseAll}
			/>
			{files && <DiffTreeToggleButton {...files} />}
			<div
				className="mx-1 h-3.5 w-px shrink-0 bg-muted-foreground/30 group-last/diff-actions:hidden"
				aria-hidden="true"
			/>
		</div>
	);
}
