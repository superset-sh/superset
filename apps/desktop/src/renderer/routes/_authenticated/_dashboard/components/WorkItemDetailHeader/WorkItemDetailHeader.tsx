import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { LuExternalLink, LuPlus } from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";

interface WorkItemDetailHeaderProps {
	itemLabel: string;
	icon: ReactNode;
	backLabel: string;
	externalLabel: string;
	url: string | null;
	onBack: () => void;
	onAddToWorkspace: (() => void) | null;
}

export function WorkItemDetailHeader({
	itemLabel,
	icon,
	backLabel,
	externalLabel,
	url,
	onBack,
	onAddToWorkspace,
}: WorkItemDetailHeaderProps) {
	const { t } = useLingui();
	return (
		<PageHeader
			className="@container shadow-[inset_0_-1px_0_var(--border)]"
			contentClassName="@md:gap-3 @md:px-6"
			start={
				<>
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
						{itemLabel}
					</span>
				</>
			}
			end={
				<div className="flex shrink-0 items-center gap-1">
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
			}
		/>
	);
}
