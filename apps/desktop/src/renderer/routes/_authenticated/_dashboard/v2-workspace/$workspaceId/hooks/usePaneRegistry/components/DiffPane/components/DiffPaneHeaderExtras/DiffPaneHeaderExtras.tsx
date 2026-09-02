import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Eye, EyeOff, MessageSquare, MessageSquareOff } from "lucide-react";
import { useSettings } from "renderer/stores/settings";
import { DiffPanePRLink } from "./components/DiffPanePRLink";

interface DiffPaneHeaderExtrasProps {
	workspaceId: string;
}

// Unified/split moved into the in-pane DiffViewToolbar (shared with the PR
// Code tab); what stays here is workspace-specific: the PR link and the
// toggles that change what the diff shows rather than how it's laid out.
export function DiffPaneHeaderExtras({
	workspaceId,
}: DiffPaneHeaderExtrasProps) {
	const { t } = useLingui();
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
			<DiffPanePRLink workspaceId={workspaceId} />
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("showDiffComments", !showDiffComments)}
						aria-label={
							showDiffComments
								? t({
										message: "Hide PR review comments",
									})
								: t({
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
						<Trans>Hide review comments</Trans>
					) : (
						<Trans>Show review comments</Trans>
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
										message: "Hide unchanged regions",
									})
								: t({
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
						<Trans>Hide unchanged regions</Trans>
					) : (
						<Trans>Show all lines</Trans>
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
