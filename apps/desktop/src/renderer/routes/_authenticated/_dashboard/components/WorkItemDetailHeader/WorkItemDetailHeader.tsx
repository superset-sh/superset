import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { LuExternalLink, LuPlus } from "react-icons/lu";

interface WorkItemDetailHeaderProps {
	itemNumber: number | null;
	icon: ReactNode;
	backLabel: string;
	externalLabel: string;
	url: string | null;
	onBack: () => void;
	onAddToWorkspace: (() => void) | null;
}

export function WorkItemDetailHeader({
	itemNumber,
	icon,
	backLabel,
	externalLabel,
	url,
	onBack,
	onAddToWorkspace,
}: WorkItemDetailHeaderProps) {
	const { t } = useLingui();
	return (
		<div className="@container flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 @md:gap-3 @md:px-6 @md:py-4">
			<Button
				variant="ghost"
				size="icon"
				className="size-8 shrink-0"
				onClick={onBack}
				aria-label={backLabel}
			>
				<HiArrowLeft className="size-4" />
			</Button>
			{icon}
			<span className="min-w-0 truncate font-mono text-sm tabular-nums text-muted-foreground">
				{itemNumber === null ? "#—" : `#${itemNumber}`}
			</span>
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag -my-3 min-w-0 flex-1 self-stretch @md:-my-4" />
			<div className="ml-auto flex shrink-0 items-center gap-1">
				{url && (
					<Button variant="ghost" size="icon" className="size-8" asChild>
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={externalLabel}
							title={externalLabel}
						>
							<LuExternalLink className="size-4" />
						</a>
					</Button>
				)}
				{onAddToWorkspace && (
					<Button
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-2 @md:px-3"
						onClick={onAddToWorkspace}
						aria-label={t({
							message: "Add to workspace",
						})}
						title={t({
							message: "Add to workspace",
						})}
					>
						<LuPlus className="size-4" />
						<span className="hidden @md:inline">
							<Trans>Add to workspace</Trans>
						</span>
					</Button>
				)}
			</div>
		</div>
	);
}
