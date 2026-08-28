import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	Eye,
	EyeOff,
	MessageSquare,
	MessageSquareOff,
	SquareSplitHorizontal,
} from "lucide-react";
import { TbScan } from "react-icons/tb";
import { useSettings } from "renderer/stores/settings";

export function DiffPaneHeaderExtras() {
	const { t } = useLingui();
	const diffStyle = useSettings((s) => s.diffStyle);
	const showDiffComments = useSettings((s) => s.showDiffComments);
	const expandUnchanged = useSettings((s) => s.expandUnchanged);
	const updateSetting = useSettings((s) => s.update);

	const buttonClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex items-center">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "unified")}
						aria-label={t({
							id: "workspace.diffPane.unifiedViewAria",
							message: "Unified view",
						})}
						aria-pressed={diffStyle === "unified"}
						className={buttonClass(diffStyle === "unified")}
					>
						<TbScan className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans id="workspace.diffPane.unifiedView">Unified view</Trans>
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "split")}
						aria-label={t({
							id: "workspace.diffPane.splitViewAria",
							message: "Split view",
						})}
						aria-pressed={diffStyle === "split"}
						className={buttonClass(diffStyle === "split")}
					>
						<SquareSplitHorizontal className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans id="workspace.diffPane.splitView">Split view</Trans>
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("showDiffComments", !showDiffComments)}
						aria-label={
							showDiffComments
								? t({
										id: "workspace.diffPane.hideReviewCommentsAria",
										message: "Hide PR review comments",
									})
								: t({
										id: "workspace.diffPane.showReviewCommentsAria",
										message: "Show PR review comments",
									})
						}
						aria-pressed={showDiffComments}
						className={buttonClass(showDiffComments)}
					>
						{showDiffComments ? (
							<MessageSquare className="size-3.5" />
						) : (
							<MessageSquareOff className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{showDiffComments ? (
						<Trans id="workspace.diffPane.hideReviewComments">
							Hide review comments
						</Trans>
					) : (
						<Trans id="workspace.diffPane.showReviewComments">
							Show review comments
						</Trans>
					)}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("expandUnchanged", !expandUnchanged)}
						aria-label={
							expandUnchanged
								? t({
										id: "workspace.diffPane.hideUnchangedRegionsAria",
										message: "Hide unchanged regions",
									})
								: t({
										id: "workspace.diffPane.showAllLinesAria",
										message: "Show all lines",
									})
						}
						aria-pressed={expandUnchanged}
						className={buttonClass(expandUnchanged)}
					>
						{expandUnchanged ? (
							<EyeOff className="size-3.5" />
						) : (
							<Eye className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{expandUnchanged ? (
						<Trans id="workspace.diffPane.hideUnchangedRegions">
							Hide unchanged regions
						</Trans>
					) : (
						<Trans id="workspace.diffPane.showAllLines">Show all lines</Trans>
					)}
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
		</div>
	);
}
